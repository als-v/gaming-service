import { FailureCode } from "../../../shared/errors/failure-code.enum.js";
import { Money } from "../../../shared/money/money.js";
import { WagerTransaction } from "../../domain/wager-transaction.js";
import { WagerTransactionEntity } from "./wager-transaction.entity.js";

export class WagerTransactionMapper {
  static toDomain(entity: WagerTransactionEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind,
      money: Money.from({ amount: entity.amountValue, currency: entity.amountCurrency }),
      referenceExternalTransactionId: entity.referenceExternalTransactionId ?? undefined,
      createdAt: entity.createdAt,
      status: entity.status,
      referenceTransactionId: entity.referenceTransactionId ?? undefined,
      failureCode: (entity.failureCode ?? undefined) as FailureCode | undefined,
      processedAt: entity.processedAt ?? undefined,
      referenceCheckAttempts: entity.referenceCheckAttempts,
      nextReferenceCheckAt: entity.nextReferenceCheckAt ?? undefined,
    });
  }

  static toPersistence(transaction: WagerTransaction): WagerTransactionEntity {
    const entity = new WagerTransactionEntity();
    entity.id = transaction.id;
    entity.providerId = transaction.providerId;
    entity.externalTransactionId = transaction.externalTransactionId;
    entity.idempotencyKey = transaction.idempotencyKey;
    entity.payloadHash = transaction.payloadHash;
    entity.walletId = transaction.walletId;
    entity.playerId = transaction.playerId;
    entity.roundId = transaction.roundId;
    entity.gameId = transaction.gameId;
    entity.kind = transaction.kind;
    entity.amountValue = transaction.money.toJSON().amount;
    entity.amountCurrency = transaction.money.currency;
    entity.referenceExternalTransactionId = transaction.referenceExternalTransactionId ?? null;
    entity.createdAt = transaction.createdAt;
    entity.status = transaction.status;
    entity.referenceTransactionId = transaction.referenceTransactionId ?? null;
    entity.failureCode = transaction.failureCode ?? null;
    entity.processedAt = transaction.processedAt ?? null;
    entity.referenceCheckAttempts = transaction.referenceCheckAttempts;
    entity.nextReferenceCheckAt = transaction.nextReferenceCheckAt ?? null;
    return entity;
  }
}
