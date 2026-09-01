import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { FailureCode } from "../errors/failure-code.enum.js";
import { IntegrationEventPreconditionError } from "./integration-event.js";
import { Money } from "../money/money.js";
import { WagerTransaction } from "../../wagering/domain/wager-transaction.js";
import { WagerTransactionKind } from "../../wagering/domain/wager-transaction-kind.enum.js";
import { WagerTransactionRejected } from "./wager-transaction-rejected.event.js";

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

describe("WagerTransactionRejected", () => {
  it("from monta o evento a partir de uma transação REJECTED", () => {
    const transaction = pendingTransaction();
    transaction.reject(FailureCode.InsufficientBalance);

    const event = WagerTransactionRejected.from(transaction, {
      eventId: randomUUID(),
      correlationId: randomUUID(),
      causationId: undefined,
      occurredAt: new Date(),
    });

    expect(event.eventType).toBe("WagerTransactionRejected");
    expect(event.aggregateId).toBe(transaction.walletId);
    expect(event.data.transactionId).toBe(transaction.id);
    expect(event.data.failureCode).toBe(FailureCode.InsufficientBalance);
  });

  it("from lança IntegrationEventPreconditionError se a transação não tem failureCode", () => {
    const transaction = pendingTransaction();
    expect(() =>
      WagerTransactionRejected.from(transaction, {
        eventId: randomUUID(),
        correlationId: randomUUID(),
        causationId: undefined,
        occurredAt: new Date(),
      }),
    ).toThrow(IntegrationEventPreconditionError);
  });
});
