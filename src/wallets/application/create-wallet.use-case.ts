import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { isUniqueViolation } from "../../shared/database/postgres-error.util.js";
import { WalletAlreadyExistsException } from "../../shared/errors/domain-http-exception.js";
import type { EventContext } from "../../shared/events/integration-event.js";
import { WagerTransactionProcessed } from "../../shared/events/wager-transaction-processed.event.js";
import { WalletBalanceChanged } from "../../shared/events/wallet-balance-changed.event.js";
import { canonicalJsonStringify, sha256Hex } from "../../shared/hashing/payload-hash.js";
import { OutboxMessage } from "../../shared/messaging/outbox-message.js";
import { OutboxMessageMapper } from "../../shared/messaging/infrastructure/persistence/outbox-message.mapper.js";
import { OutboxMessageEntity } from "../../shared/messaging/infrastructure/persistence/outbox-message.entity.js";
import { Money, type MoneyProps } from "../../shared/money/money.js";
import { LedgerDirection } from "../domain/ledger-direction.enum.js";
import { Wallet } from "../domain/wallet.js";
import { WalletLedgerEntry } from "../domain/wallet-ledger-entry.js";
import { WagerTransactionKind } from "../../wagering/domain/wager-transaction-kind.enum.js";
import { WagerTransaction } from "../../wagering/domain/wager-transaction.js";
import { WagerTransactionEntity } from "../../wagering/infrastructure/persistence/wager-transaction.entity.js";
import { WagerTransactionMapper } from "../../wagering/infrastructure/persistence/wager-transaction.mapper.js";
import { WalletEntity } from "../infrastructure/persistence/wallet.entity.js";
import { WalletLedgerEntryEntity } from "../infrastructure/persistence/wallet-ledger-entry.entity.js";
import { WalletLedgerEntryMapper } from "../infrastructure/persistence/wallet-ledger-entry.mapper.js";
import { WalletMapper } from "../infrastructure/persistence/wallet.mapper.js";

const INTERNAL_OPENING_PROVIDER_ID = "internal";
const INTERNAL_OPENING_ROUND_ID = "internal-opening";
const INTERNAL_OPENING_GAME_ID = "internal-opening";

export interface CreateWalletCommand {
  playerId: string;
  initialBalance: MoneyProps;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(command: CreateWalletCommand): Promise<Wallet> {
    const initialBalance = Money.from(command.initialBalance);
    const now = new Date();
    const wallet = Wallet.open({ id: randomUUID(), playerId: command.playerId, initialBalance, now });

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(WalletEntity).insert(WalletMapper.toPersistence(wallet));

        if (!initialBalance.isPositive()) {
          return;
        }

        const opening = WagerTransaction.create({
          id: randomUUID(),
          providerId: INTERNAL_OPENING_PROVIDER_ID,
          externalTransactionId: wallet.id,
          idempotencyKey: `internal-opening:${wallet.id}`,
          payloadHash: sha256Hex(
            canonicalJsonStringify({
              kind: WagerTransactionKind.Opening,
              walletId: wallet.id,
              money: initialBalance.toJSON(),
            }),
          ),
          walletId: wallet.id,
          playerId: wallet.playerId,
          roundId: INTERNAL_OPENING_ROUND_ID,
          gameId: INTERNAL_OPENING_GAME_ID,
          kind: WagerTransactionKind.Opening,
          money: initialBalance,
          referenceExternalTransactionId: undefined,
          createdAt: now,
        });
        opening.markProcessed(undefined, now);

        const entry = WalletLedgerEntry.create({
          id: randomUUID(),
          walletId: wallet.id,
          transactionId: opening.id,
          direction: LedgerDirection.Credit,
          money: initialBalance,
          balanceBefore: Money.zero(initialBalance.currency),
          balanceAfter: initialBalance,
          createdAt: now,
        });

        await manager
          .getRepository(WagerTransactionEntity)
          .insert(WagerTransactionMapper.toPersistence(opening));
        await manager
          .getRepository(WalletLedgerEntryEntity)
          .insert(WalletLedgerEntryMapper.toPersistence(entry));

        const ctx: EventContext = {
          eventId: randomUUID(),
          correlationId: randomUUID(),
          causationId: undefined,
          occurredAt: now,
        };
        const events = [
          WagerTransactionProcessed.from(opening, ctx),
          WalletBalanceChanged.from(wallet, entry, { ...ctx, eventId: randomUUID() }),
        ];
        const outboxRepository = manager.getRepository(OutboxMessageEntity);
        for (const event of events) {
          await outboxRepository.save(OutboxMessageMapper.toPersistence(OutboxMessage.enqueue(event)));
        }
      });
    } catch (error) {
      if (isUniqueViolation(error, "UQ_wallets_player_id_currency")) {
        throw new WalletAlreadyExistsException(command.playerId, initialBalance.currency);
      }
      throw error;
    }

    return wallet;
  }
}
