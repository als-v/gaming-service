import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { Money } from "../money/money.js";
import { WalletBalanceChanged } from "../events/wallet-balance-changed.event.js";
import { Wallet } from "../../wallets/domain/wallet.js";
import { OutboxMessage, OutboxMessageAlreadyPublishedError } from "./outbox-message.js";

function sampleEvent(): WalletBalanceChanged {
  const wallet = Wallet.open({
    id: randomUUID(),
    playerId: randomUUID(),
    initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    now: new Date(),
  });
  const entry = wallet.debit({
    transactionId: randomUUID(),
    money: Money.from({ amount: "80.00", currency: "BRL" }),
    at: new Date(),
  });
  return WalletBalanceChanged.from(wallet, entry, {
    eventId: randomUUID(),
    correlationId: randomUUID(),
    causationId: undefined,
    occurredAt: new Date(),
  });
}

describe("OutboxMessage", () => {
  it("enqueue cria uma mensagem pendente a partir do envelope do evento", () => {
    const event = sampleEvent();
    const message = OutboxMessage.enqueue(event);
    expect(message.isPending()).toBe(true);
    expect(message.attempts).toBe(0);
    expect(message.aggregateId).toBe(event.aggregateId);
    expect(message.eventType).toBe("WalletBalanceChanged");
    expect(message.payload).toEqual(event.toJSON());
  });

  it("isDue é true quando não há nextAttemptAt ainda", () => {
    const message = OutboxMessage.enqueue(sampleEvent());
    expect(message.isDue(new Date())).toBe(true);
  });

  it("scheduleRetry incrementa attempts e agenda nextAttemptAt com backoff exponencial capado", () => {
    const message = OutboxMessage.enqueue(sampleEvent());
    const now = new Date("2026-01-01T00:00:00.000Z");

    message.scheduleRetry(now);
    expect(message.attempts).toBe(1);
    expect(message.nextAttemptAt).toEqual(new Date(now.getTime() + 2_000));
    expect(message.isDue(now)).toBe(false);
    expect(message.isDue(new Date(now.getTime() + 2_000))).toBe(true);

    message.scheduleRetry(now);
    expect(message.attempts).toBe(2);
    expect(message.nextAttemptAt).toEqual(new Date(now.getTime() + 4_000));
  });

  it("scheduleRetry capa o delay em 5 minutos", () => {
    const message = OutboxMessage.enqueue(sampleEvent());
    const now = new Date("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 20; i += 1) {
      message.scheduleRetry(now);
    }
    expect(message.nextAttemptAt).toEqual(new Date(now.getTime() + 5 * 60_000));
  });

  it("markPublished marca a mensagem como publicada", () => {
    const message = OutboxMessage.enqueue(sampleEvent());
    const publishedAt = new Date();
    message.markPublished(publishedAt);
    expect(message.isPending()).toBe(false);
    expect(message.publishedAt).toBe(publishedAt);
    expect(message.isDue(new Date())).toBe(false);
  });

  it("markPublished/scheduleRetry lançam OutboxMessageAlreadyPublishedError após publicada", () => {
    const message = OutboxMessage.enqueue(sampleEvent());
    message.markPublished(new Date());
    expect(() => message.markPublished(new Date())).toThrow(OutboxMessageAlreadyPublishedError);
    expect(() => message.scheduleRetry(new Date())).toThrow(OutboxMessageAlreadyPublishedError);
  });

  it("rehydrate reconstrói o estado sem revalidar nada", () => {
    const state = {
      id: randomUUID(),
      aggregateId: randomUUID(),
      eventType: "WalletBalanceChanged",
      payload: { foo: "bar" },
      occurredAt: new Date(),
      attempts: 3,
      nextAttemptAt: new Date(),
      publishedAt: undefined,
    };
    const message = OutboxMessage.rehydrate(state);
    expect(message.attempts).toBe(3);
    expect(message.isPending()).toBe(true);
  });
});
