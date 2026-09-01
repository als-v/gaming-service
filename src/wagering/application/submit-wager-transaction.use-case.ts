import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";

import {
  isTransientTransactionError,
  isUniqueViolation,
  postgresErrorCodeOf,
} from "../../shared/database/postgres-error.util.js";
import {
  CurrencyMismatchException,
  IdempotencyConflictException,
  InsufficientBalanceException,
  ReferenceAlreadyUsedException,
  ReferenceMismatchException,
  ReferenceWrongKindException,
  ReversalWouldOverdrawException,
  ValidationFailedException,
  WalletNotFoundException,
  type DomainHttpException,
} from "../../shared/errors/domain-http-exception.js";
import { DomainError } from "../../shared/errors/domain-error.js";
import { FailureCode } from "../../shared/errors/failure-code.enum.js";
import type { EventContext } from "../../shared/events/integration-event.js";
import type { IntegrationEvent } from "../../shared/events/integration-event.js";
import { WagerTransactionPendingReference } from "../../shared/events/wager-transaction-pending-reference.event.js";
import { WagerTransactionProcessed } from "../../shared/events/wager-transaction-processed.event.js";
import { WagerTransactionRejected } from "../../shared/events/wager-transaction-rejected.event.js";
import { WalletBalanceChanged } from "../../shared/events/wallet-balance-changed.event.js";
import { canonicalJsonStringify, sha256Hex } from "../../shared/hashing/payload-hash.js";
import { OutboxMessageEntity } from "../../shared/messaging/infrastructure/persistence/outbox-message.entity.js";
import { OutboxMessageMapper } from "../../shared/messaging/infrastructure/persistence/outbox-message.mapper.js";
import { OutboxMessage } from "../../shared/messaging/outbox-message.js";
import { CurrencyMismatchError } from "../../shared/money/money.errors.js";
import { Money, type MoneyProps } from "../../shared/money/money.js";
import { LedgerDirection } from "../../wallets/domain/ledger-direction.enum.js";
import { InsufficientBalanceError } from "../../wallets/domain/wallet.errors.js";
import { WalletLedgerEntryEntity } from "../../wallets/infrastructure/persistence/wallet-ledger-entry.entity.js";
import { WalletLedgerEntryMapper } from "../../wallets/infrastructure/persistence/wallet-ledger-entry.mapper.js";
import { WalletEntity } from "../../wallets/infrastructure/persistence/wallet.entity.js";
import { WalletMapper } from "../../wallets/infrastructure/persistence/wallet.mapper.js";
import type { SubmittableWagerTransactionKind } from "../interface/dto/submittable-wager-transaction-kind.js";
import { WagerTransactionKind } from "../domain/wager-transaction-kind.enum.js";
import { WagerTransactionStatus } from "../domain/wager-transaction-status.enum.js";
import { WagerTransaction } from "../domain/wager-transaction.js";
import { WagerTransactionEntity } from "../infrastructure/persistence/wager-transaction.entity.js";
import { WagerTransactionMapper } from "../infrastructure/persistence/wager-transaction.mapper.js";

export interface SubmitWagerTransactionCommand {
  idempotencyKey: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: SubmittableWagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId: string | undefined;
  correlationId?: string;
  causationId?: string;
}

export interface SubmitWagerTransactionResult {
  transaction: WagerTransaction;
  walletBalance: MoneyProps;
  idempotentReplay: boolean;
}

function buildPayloadHash(command: SubmitWagerTransactionCommand): string {
  return sha256Hex(
    canonicalJsonStringify({
      providerId: command.providerId,
      externalTransactionId: command.externalTransactionId,
      playerId: command.playerId,
      walletId: command.walletId,
      roundId: command.roundId,
      gameId: command.gameId,
      kind: command.kind,
      money: command.money,
      referenceExternalTransactionId: command.referenceExternalTransactionId ?? null,
    }),
  );
}

const MAX_TRANSIENT_RETRY_ATTEMPTS = 8;
const TRANSIENT_RETRY_BASE_DELAY_MS = 20;
const TRANSIENT_RETRY_JITTER_MS = 40;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transientRetryDelay(attempt: number): number {
  return TRANSIENT_RETRY_BASE_DELAY_MS * attempt + Math.random() * TRANSIENT_RETRY_JITTER_MS;
}

@Injectable()
export class SubmitWagerTransactionUseCase {
  private readonly logger = new Logger(SubmitWagerTransactionUseCase.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(command: SubmitWagerTransactionCommand): Promise<SubmitWagerTransactionResult> {
    let result: SubmitWagerTransactionResult;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        result = await this.dataSource.transaction((manager) => this.run(manager, command));
        break;
      } catch (error) {
        if (isUniqueViolation(error, "UQ_wager_transactions_reference_kind_processed")) {
          throw new ReferenceAlreadyUsedException(command.referenceExternalTransactionId ?? "");
        }
        if (isTransientTransactionError(error) && attempt < MAX_TRANSIENT_RETRY_ATTEMPTS) {
          this.logger.warn(
            `Retentando transação após erro transitório do Postgres na wallet "${command.walletId}" ` +
              `(tentativa ${attempt}/${MAX_TRANSIENT_RETRY_ATTEMPTS}, code=${postgresErrorCodeOf(error) ?? "unknown"}).`,
          );
          await delay(transientRetryDelay(attempt));
          continue;
        }
        throw error;
      }
    }

    if (
      result.transaction.status === WagerTransactionStatus.Rejected ||
      result.transaction.status === WagerTransactionStatus.Failed
    ) {
      throw this.toHttpException(result);
    }
    return result;
  }

  private async run(
    manager: EntityManager,
    command: SubmitWagerTransactionCommand,
  ): Promise<SubmitWagerTransactionResult> {
    const now = new Date();
    const payloadHash = buildPayloadHash(command);

    let transaction: WagerTransaction;
    try {
      transaction = WagerTransaction.create({
        id: randomUUID(),
        providerId: command.providerId,
        externalTransactionId: command.externalTransactionId,
        idempotencyKey: command.idempotencyKey,
        payloadHash,
        walletId: command.walletId,
        playerId: command.playerId,
        roundId: command.roundId,
        gameId: command.gameId,
        kind: command.kind as WagerTransactionKind,
        money: Money.from(command.money),
        referenceExternalTransactionId: command.referenceExternalTransactionId,
        createdAt: now,
      });
    } catch (error) {
      if (error instanceof DomainError && error.failureCode === FailureCode.ValidationError) {
        throw new ValidationFailedException([
          { field: "referenceExternalTransactionId", constraints: [error.message] },
        ]);
      }
      throw error;
    }

    const wagerTransactionRepository = manager.getRepository(WagerTransactionEntity);

    try {
      await manager.transaction(async (nested) => {
        await nested.getRepository(WagerTransactionEntity).insert(WagerTransactionMapper.toPersistence(transaction));
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      return this.handleReplay(manager, command, payloadHash);
    }

    const ctx: EventContext = {
      eventId: randomUUID(),
      correlationId: command.correlationId ?? randomUUID(),
      causationId: command.causationId,
      occurredAt: now,
    };

    let referenceTransaction: WagerTransaction | undefined;
    if (transaction.requiresReference()) {
      const referenceExternalTransactionId = command.referenceExternalTransactionId as string;
      const referenceEntity = await manager.getRepository(WagerTransactionEntity).findOne({
        where: { providerId: command.providerId, externalTransactionId: referenceExternalTransactionId },
      });

      if (referenceEntity === null) {
        transaction.markPendingReference();
        await wagerTransactionRepository.update(
          transaction.id,
          WagerTransactionMapper.toPersistence(transaction),
        );
        await this.enqueue(
          manager,
          WagerTransactionPendingReference.from(transaction, ctx),
        );
        return this.toResult(transaction, undefined, false);
      }

      const candidate = WagerTransactionMapper.toDomain(referenceEntity);
      const mismatchCode = this.validateReferenceFields(transaction, candidate, command);
      if (mismatchCode !== undefined) {
        transaction.reject(mismatchCode);
        await wagerTransactionRepository.update(
          transaction.id,
          WagerTransactionMapper.toPersistence(transaction),
        );
        await this.enqueue(manager, WagerTransactionRejected.from(transaction, ctx));
        return this.toResult(transaction, undefined, false);
      }

      referenceTransaction = candidate;
    } else if (command.referenceExternalTransactionId !== undefined) {
      const referenceEntity = await manager.getRepository(WagerTransactionEntity).findOne({
        where: {
          providerId: command.providerId,
          externalTransactionId: command.referenceExternalTransactionId,
        },
      });
      referenceTransaction = referenceEntity === null ? undefined : WagerTransactionMapper.toDomain(referenceEntity);
    }

    const walletEntity = await manager.getRepository(WalletEntity).findOne({
      where: { id: command.walletId },
      lock: { mode: "for_no_key_update" },
    });

    if (walletEntity === null) {
      transaction.fail(FailureCode.WalletNotFound);
      await wagerTransactionRepository.update(
        transaction.id,
        WagerTransactionMapper.toPersistence(transaction),
      );
      return this.toResult(transaction, undefined, false);
    }

    const wallet = WalletMapper.toDomain(walletEntity);

    if (transaction.requiresReference() && referenceTransaction !== undefined) {
      const alreadyUsed = await this.isReferenceAlreadyUsed(manager, referenceTransaction.id, transaction.kind);
      if (alreadyUsed) {
        transaction.reject(FailureCode.ReferenceAlreadyUsed);
        await wagerTransactionRepository.update(
          transaction.id,
          WagerTransactionMapper.toPersistence(transaction),
        );
        await this.enqueue(manager, WagerTransactionRejected.from(transaction, ctx));
        return this.toResult(transaction, wallet.balance.toJSON(), false);
      }
    }

    if (!transaction.affectsBalance()) {
      transaction.markProcessed(referenceTransaction?.id, now);
      await wagerTransactionRepository.update(
        transaction.id,
        WagerTransactionMapper.toPersistence(transaction),
      );
      await this.enqueue(manager, WagerTransactionProcessed.from(transaction, ctx));
      return this.toResult(transaction, wallet.balance.toJSON(), false);
    }

    try {
      const direction = transaction.ledgerDirectionFor(referenceTransaction);
      const entry =
        direction === LedgerDirection.Debit
          ? wallet.debit({ transactionId: transaction.id, money: transaction.money, at: now })
          : wallet.credit({ transactionId: transaction.id, money: transaction.money, at: now });
      transaction.markProcessed(referenceTransaction?.id, now);

      await manager.getRepository(WalletEntity).update(wallet.id, {
        balanceAmount: wallet.balance.toJSON().amount,
        version: wallet.version,
        updatedAt: wallet.updatedAt,
      });
      await manager
        .getRepository(WalletLedgerEntryEntity)
        .insert(WalletLedgerEntryMapper.toPersistence(entry));
      await wagerTransactionRepository.update(
        transaction.id,
        WagerTransactionMapper.toPersistence(transaction),
      );
      await this.enqueue(manager, WagerTransactionProcessed.from(transaction, ctx));
      await this.enqueue(manager, WalletBalanceChanged.from(wallet, entry, { ...ctx, eventId: randomUUID() }));

      return this.toResult(transaction, wallet.balance.toJSON(), false);
    } catch (error) {
      const code = this.rejectionCodeFor(transaction, error);
      if (code === undefined) {
        throw error;
      }
      transaction.reject(code);
      await wagerTransactionRepository.update(
        transaction.id,
        WagerTransactionMapper.toPersistence(transaction),
      );
      await this.enqueue(manager, WagerTransactionRejected.from(transaction, ctx));
      return this.toResult(transaction, wallet.balance.toJSON(), false);
    }
  }

  private rejectionCodeFor(transaction: WagerTransaction, error: unknown): FailureCode | undefined {
    if (error instanceof InsufficientBalanceError) {
      return transaction.kind === WagerTransactionKind.Rollback
        ? FailureCode.ReversalWouldOverdraw
        : FailureCode.InsufficientBalance;
    }
    if (error instanceof CurrencyMismatchError) {
      return FailureCode.CurrencyMismatch;
    }
    return undefined;
  }

  private validateReferenceFields(
    transaction: WagerTransaction,
    reference: WagerTransaction,
    command: SubmitWagerTransactionCommand,
  ): FailureCode | undefined {
    if (
      reference.status !== WagerTransactionStatus.Processed ||
      reference.playerId !== command.playerId ||
      reference.walletId !== command.walletId ||
      reference.roundId !== command.roundId ||
      !reference.money.equals(transaction.money)
    ) {
      return FailureCode.ReferenceMismatch;
    }

    const validKinds: WagerTransactionKind[] =
      transaction.kind === WagerTransactionKind.Refund
        ? [WagerTransactionKind.Bet]
        : [WagerTransactionKind.Bet, WagerTransactionKind.Win, WagerTransactionKind.Refund];
    if (!validKinds.includes(reference.kind)) {
      return FailureCode.ReferenceWrongKind;
    }

    return undefined;
  }

  private async isReferenceAlreadyUsed(
    manager: EntityManager,
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<boolean> {
    const existing = await manager.getRepository(WagerTransactionEntity).findOne({
      where: {
        referenceTransactionId,
        kind,
        status: WagerTransactionStatus.Processed,
      },
    });
    return existing !== null;
  }

  private async handleReplay(
    manager: EntityManager,
    command: SubmitWagerTransactionCommand,
    payloadHash: string,
  ): Promise<SubmitWagerTransactionResult> {
    const existingEntity = await manager
      .getRepository(WagerTransactionEntity)
      .findOne({ where: { idempotencyKey: command.idempotencyKey } });

    if (existingEntity === null) {
      throw new IdempotencyConflictException(command.idempotencyKey);
    }

    const existing = WagerTransactionMapper.toDomain(existingEntity);
    if (!existing.matchesPayload(payloadHash)) {
      throw new IdempotencyConflictException(command.idempotencyKey);
    }

    const walletEntity = await manager
      .getRepository(WalletEntity)
      .findOne({ where: { id: existing.walletId } });
    const balance = walletEntity === null ? undefined : WalletMapper.toDomain(walletEntity).balance.toJSON();

    return this.toResult(existing, balance, true);
  }

  private toResult(
    transaction: WagerTransaction,
    balance: MoneyProps | undefined,
    idempotentReplay: boolean,
  ): SubmitWagerTransactionResult {
    return {
      transaction,
      walletBalance: balance ?? transaction.money.toJSON(),
      idempotentReplay,
    };
  }

  private async enqueue(manager: EntityManager, event: IntegrationEvent<unknown>): Promise<void> {
    await manager
      .getRepository(OutboxMessageEntity)
      .save(OutboxMessageMapper.toPersistence(OutboxMessage.enqueue(event)));
  }

  private toHttpException(result: SubmitWagerTransactionResult): DomainHttpException {
    const transaction = result.transaction;
    const referenceExternalTransactionId = transaction.referenceExternalTransactionId ?? "";
    switch (transaction.failureCode) {
      case FailureCode.InsufficientBalance:
        return new InsufficientBalanceException(transaction.walletId);
      case FailureCode.ReversalWouldOverdraw:
        return new ReversalWouldOverdrawException(transaction.walletId);
      case FailureCode.CurrencyMismatch:
        return new CurrencyMismatchException(result.walletBalance.currency, transaction.money.currency);
      case FailureCode.ReferenceMismatch:
        return new ReferenceMismatchException(referenceExternalTransactionId);
      case FailureCode.ReferenceWrongKind:
        return new ReferenceWrongKindException(referenceExternalTransactionId);
      case FailureCode.ReferenceAlreadyUsed:
        return new ReferenceAlreadyUsedException(referenceExternalTransactionId);
      case FailureCode.WalletNotFound:
        return new WalletNotFoundException(transaction.walletId);
      default:
        throw new Error(`FailureCode inesperado para transação rejeitada/falha: ${String(transaction.failureCode)}`);
    }
  }
}
