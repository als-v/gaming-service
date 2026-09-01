import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "bun:test";

import { SubmitWagerTransactionDto } from "./submit-wager-transaction.dto.js";

const validPayload = {
  providerId: "provider-a",
  externalTransactionId: "transaction-123",
  playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  walletId: "0192f291-27dd-7d3f-8071-5f8685deef37",
  roundId: "round-987",
  gameId: "fortune-chimp",
  kind: "BET",
  money: { amount: "25.00", currency: "BRL" },
};

describe("SubmitWagerTransactionDto", () => {
  it("aceita payload válido", async () => {
    const dto = plainToInstance(SubmitWagerTransactionDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejeita kind OPENING", async () => {
    const dto = plainToInstance(SubmitWagerTransactionDto, { ...validPayload, kind: "OPENING" });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "kind")).toBe(true);
  });

  it("rejeita kind desconhecido", async () => {
    const dto = plainToInstance(SubmitWagerTransactionDto, { ...validPayload, kind: "DEPOSIT" });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "kind")).toBe(true);
  });

  it("aceita referenceExternalTransactionId opcional quando presente", async () => {
    const dto = plainToInstance(SubmitWagerTransactionDto, {
      ...validPayload,
      kind: "REFUND",
      referenceExternalTransactionId: "transaction-123",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejeita providerId ausente", async () => {
    const { providerId: _providerId, ...rest } = validPayload;
    const dto = plainToInstance(SubmitWagerTransactionDto, rest);
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "providerId")).toBe(true);
  });
});
