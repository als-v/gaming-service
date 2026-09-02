import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { IntegrationEventPreconditionError } from "./integration-event.js";
import { Money } from "../money/money.js";
import { WagerTransaction } from "../../wagering/domain/wager-transaction.js";
import { WagerTransactionKind } from "../../wagering/domain/wager-transaction-kind.enum.js";
import { WagerTransactionPendingReference } from "./wager-transaction-pending-reference.event.js";

function refundTransaction(): WagerTransaction {
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
    kind: WagerTransactionKind.Refund,
    money: Money.from({ amount: "25.00", currency: "BRL" }),
    referenceExternalTransactionId: "external-ref-1",
    createdAt: new Date(),
  });
}

describe("WagerTransactionPendingReference", () => {
  it("from monta o evento a partir de uma transação PENDING_REFERENCE", () => {
    const transaction = refundTransaction();
    transaction.markPendingReference(new Date());

    const event = WagerTransactionPendingReference.from(transaction, {
      eventId: randomUUID(),
      correlationId: randomUUID(),
      causationId: undefined,
      occurredAt: new Date(),
    });

    expect(event.eventType).toBe("WagerTransactionPendingReference");
    expect(event.aggregateId).toBe(transaction.walletId);
    expect(event.data.transactionId).toBe(transaction.id);
    expect(event.data.referenceExternalTransactionId).toBe("external-ref-1");
  });

  it("from lança IntegrationEventPreconditionError se a transação não tem referenceExternalTransactionId", () => {
    const transaction = WagerTransaction.create({
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

    expect(() =>
      WagerTransactionPendingReference.from(transaction, {
        eventId: randomUUID(),
        correlationId: randomUUID(),
        causationId: undefined,
        occurredAt: new Date(),
      }),
    ).toThrow(IntegrationEventPreconditionError);
  });
});
