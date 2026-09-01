import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { IntegrationEventPreconditionError } from "./integration-event.js";
import { Money } from "../money/money.js";
import { WagerTransaction } from "../../wagering/domain/wager-transaction.js";
import { WagerTransactionKind } from "../../wagering/domain/wager-transaction-kind.enum.js";
import { WagerTransactionProcessed } from "./wager-transaction-processed.event.js";

function pendingTransaction(): WagerTransaction {
  return WagerTransaction.create({
    id: randomUUID(),
    providerId: "provider-a",
    externalTransactionId: "transaction-123",
    idempotencyKey: randomUUID(),
    payloadHash: "hash-1",
    walletId: randomUUID(),
    playerId: randomUUID(),
    roundId: "round-1",
    gameId: "fortune-chimp",
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: "25.00", currency: "BRL" }),
    referenceExternalTransactionId: undefined,
    createdAt: new Date(),
  });
}

describe("WagerTransactionProcessed", () => {
  it("from monta o evento a partir de uma transação PROCESSED", () => {
    const transaction = pendingTransaction();
    const referenceTransactionId = randomUUID();
    const processedAt = new Date();
    transaction.markProcessed(referenceTransactionId, processedAt);

    const event = WagerTransactionProcessed.from(transaction, {
      eventId: randomUUID(),
      correlationId: randomUUID(),
      causationId: undefined,
      occurredAt: new Date(),
    });

    expect(event.eventType).toBe("WagerTransactionProcessed");
    expect(event.aggregateId).toBe(transaction.walletId);
    expect(event.data.transactionId).toBe(transaction.id);
    expect(event.data.referenceTransactionId).toBe(referenceTransactionId);
    expect(event.data.processedAt).toBe(processedAt.toISOString());
  });

  it("from lança IntegrationEventPreconditionError se a transação ainda não foi processada", () => {
    const transaction = pendingTransaction();
    expect(() =>
      WagerTransactionProcessed.from(transaction, {
        eventId: randomUUID(),
        correlationId: randomUUID(),
        causationId: undefined,
        occurredAt: new Date(),
      }),
    ).toThrow(IntegrationEventPreconditionError);
  });
});
