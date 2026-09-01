import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { InboxMessage, InboxMessageAlreadyProcessedError } from "./inbox-message.js";

describe("InboxMessage", () => {
  it("receive cria uma mensagem não processada", () => {
    const message = InboxMessage.receive({
      messageId: randomUUID(),
      consumerName: "wagering-consumer",
      payloadHash: "hash-1",
      receivedAt: new Date(),
    });
    expect(message.isProcessed()).toBe(false);
    expect(message.processedAt).toBeUndefined();
  });

  it("markProcessed marca a mensagem como processada", () => {
    const message = InboxMessage.receive({
      messageId: randomUUID(),
      consumerName: "wagering-consumer",
      payloadHash: "hash-1",
      receivedAt: new Date(),
    });
    const processedAt = new Date();
    message.markProcessed(processedAt);
    expect(message.isProcessed()).toBe(true);
    expect(message.processedAt).toBe(processedAt);
  });

  it("markProcessed lança InboxMessageAlreadyProcessedError se chamado duas vezes", () => {
    const message = InboxMessage.receive({
      messageId: randomUUID(),
      consumerName: "wagering-consumer",
      payloadHash: "hash-1",
      receivedAt: new Date(),
    });
    message.markProcessed(new Date());
    expect(() => message.markProcessed(new Date())).toThrow(InboxMessageAlreadyProcessedError);
  });

  it("rehydrate reconstrói o estado sem revalidar nada", () => {
    const state = {
      messageId: randomUUID(),
      consumerName: "wagering-consumer",
      payloadHash: "hash-1",
      receivedAt: new Date(),
      processedAt: new Date(),
    };
    const message = InboxMessage.rehydrate(state);
    expect(message.isProcessed()).toBe(true);
    expect(message.messageId).toBe(state.messageId);
  });
});
