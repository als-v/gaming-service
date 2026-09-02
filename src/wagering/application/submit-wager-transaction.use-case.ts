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
import { InboxMessage } from "../../shared/messaging/inbox-message.js";
import { InboxMessageEntity } from "../../shared/messaging/infrastructure/persistence/inbox-message.entity.js";
import { InboxMessageMapper } from "../../shared/messaging/infrastructure/persistence/inbox-message.mapper.js";
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

export interface SubmitWagerTransactionInboxProps {
  consumerName: string;
  messageId: string;
}

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
  inbox?: SubmitWagerTransactionInboxProps;
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
    try {
      result = await this.runInTransaction(
        (manager) => this.run(manager, command),
        `wallet "${command.walletId}"`,
      );
    } catch (error) {
      if (isUniqueViolation(error, "UQ_wager_transactions_reference_kind_processed")) {
        throw new ReferenceAlreadyUsedException(command.referenceExternalTransactionId ?? "");
      }
      throw error;
    }

    if (
      result.transaction.status === WagerTransactionStatus.Rejected ||
      result.transaction.status === WagerTransactionStatus.Failed
    ) {
      throw this.toHttpException(result);
    }
    return result;
  }

  async retryDueReferences(now: Date = new Date(), batchSize = 20): Promise<number> {
    const dueIds = await this.findDuePendingReferenceIds(now, batchSize);
    let advanced = 0;
    for (const id of dueIds) {
      if (await this.retryOnePendingReference(id, now)) {
        advanced += 1;
      }
    }
    return advanced;
  }

  private async runInTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
    context: string,
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.dataSource.transaction(operation);
      } catch (error) {
        if (isTransientTransactionError(error) && attempt < MAX_TRANSIENT_RETRY_ATTEMPTS) {
          this.logger.warn(
            `Retentando transação após erro transitório do Postgres em ${context} ` +
              `(tentativa ${attempt}/${MAX_TRANSIENT_RETRY_ATTEMPTS}, code=${postgresErrorCodeOf(error) ?? "unknown"}).`,
          );
          await delay(transientRetryDelay(attempt));
          continue;
        }
        throw error;
      }
    }
  }

  private async findDuePendingReferenceIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.dataSource
      .createQueryBuilder(WagerTransactionEntity, "t")
      .select('t.id', "id")
      .where("t.status = :status", { status: WagerTransactionStatus.PendingReference })
      .andWhere("(t.next_reference_check_at IS NULL OR t.next_reference_check_at <= :now)", { now })
      .orderBy("t.created_at", "ASC")
      .limit(limit)
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  private async retryOnePendingReference(id: string, now: Date): Promise<boolean> {
    try {
      return await this.runInTransaction(
        (manager) => this.attemptReferenceResolution(manager, id, now),
        `resolução de referência pendente "${id}"`,
      );
    } catch (error) {
      if (isUniqueViolation(error, "UQ_wager_transactions_reference_kind_processed")) {
        this.logger.warn(
          `Referência já utilizada por outra transação concorrente ao tentar resolver "${id}"; ignorando.`,
        );
        return false;
      }
      throw error;
    }
  }

  private async attemptReferenceResolution(
    manager: EntityManager,
    id: string,
    now: Date,
  ): Promise<boolean> {
    const wagerTransactionRepository = manager.getRepository(WagerTransactionEntity);

    const entity = await wagerTransactionRepository.findOne({
      where: { id },
      lock: { mode: "pessimistic_write", onLocked: "skip_locked" },
    });
    if (entity === null || entity.status !== WagerTransactionStatus.PendingReference) {
      return false;
    }

    const transaction = WagerTransactionMapper.toDomain(entity);
    const referenceExternalTransactionId = transaction.referenceExternalTransactionId as string;
    const ctx: EventContext = {
      eventId: randomUUID(),
      correlationId: randomUUID(),
      causationId: transaction.id,
      occurredAt: now,
    };

    const referenceEntity = await manager.getRepository(WagerTransactionEntity).findOne({
      where: { providerId: transaction.providerId, externalTransactionId: referenceExternalTransactionId },
    });

    if (referenceEntity === null) {
      transaction.recordFailedReferenceCheck(now);
      await wagerTransactionRepository.update(transaction.id, WagerTransactionMapper.toPersistence(transaction));
      if (transaction.status === WagerTransactionStatus.Rejected) {
        await this.enqueue(manager, WagerTransactionRejected.from(transaction, ctx));
      }
      return true;
    }

    const candidate = WagerTransactionMapper.toDomain(referenceEntity);
    const mismatchCode = this.validateReferenceFields(transaction, candidate, {
      playerId: transaction.playerId,
      walletId: transaction.walletId,
      roundId: transaction.roundId,
    });
    if (mismatchCode !== undefined) {
      transaction.reject(mismatchCode);
      await wagerTransactionRepository.update(transaction.id, WagerTransactionMapper.toPersistence(transaction));
      await this.enqueue(manager, WagerTransactionRejected.from(transaction, ctx));
      return true;
    }

    await this.finalizeTransaction(manager, transaction, candidate, ctx, now);
    return true;
  }

  private async run(
    manager: EntityManager,
    command: SubmitWagerTransactionCommand,
  ): Promise<SubmitWagerTransactionResult> {
    const now = new Date();
    const payloadHash = buildPayloadHash(command);

    if (command.inbox !== undefined) {
      const alreadyHandled = await this.tryClaimInboxMessage(manager, command.inbox, payloadHash, now);
      if (alreadyHandled) {
        return this.handleReplay(manager, command, payloadHash);
      }
    }

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
        transaction.markPendingReference(now);
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

    return this.finalizeTransaction(manager, transaction, referenceTransaction, ctx, now);
  }

  private async finalizeTransaction(
    manager: EntityManager,
    transaction: WagerTransaction,
    referenceTransaction: WagerTransaction | undefined,
    ctx: EventContext,
    now: Date,
  ): Promise<SubmitWagerTransactionResult> {
    const wagerTransactionRepository = manager.getRepository(WagerTransactionEntity);

    const walletEntity = await manager.getRepository(WalletEntity).findOne({
      where: { id: transaction.walletId },
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
    expected: Pick<SubmitWagerTransactionCommand, "playerId" | "walletId" | "roundId">,
  ): FailureCode | undefined {
    if (
      reference.status !== WagerTransactionStatus.Processed ||
      reference.playerId !== expected.playerId ||
      reference.walletId !== expected.walletId ||
      reference.roundId !== expected.roundId ||
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

  private async tryClaimInboxMessage(
    manager: EntityManager,
    inbox: SubmitWagerTransactionInboxProps,
    payloadHash: string,
    now: Date,
  ): Promise<boolean> {
    const message = InboxMessage.receive({
      messageId: inbox.messageId,
      consumerName: inbox.consumerName,
      payloadHash,
      receivedAt: now,
    });
    message.markProcessed(now);

    try {
      await manager.transaction(async (nested) => {
        await nested.getRepository(InboxMessageEntity).insert(InboxMessageMapper.toPersistence(message));
      });
      return false;
    } catch (error) {
      if (!isUniqueViolation(error, "PK_inbox_messages")) {
        throw error;
      }
      return true;
    }
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
