import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "bun:test";

import { CreateWalletDto } from "./create-wallet.dto.js";

describe("CreateWalletDto", () => {
  it("aceita payload válido", async () => {
    const dto = plainToInstance(CreateWalletDto, {
      playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
      initialBalance: { amount: "1000.00", currency: "BRL" },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejeita playerId ausente", async () => {
    const dto = plainToInstance(CreateWalletDto, {
      initialBalance: { amount: "1000.00", currency: "BRL" },
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "playerId")).toBe(true);
  });

  it("rejeita initialBalance com amount de 3 casas decimais", async () => {
    const dto = plainToInstance(CreateWalletDto, {
      playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
      initialBalance: { amount: "1000.000", currency: "BRL" },
    });
    const errors = await validate(dto);
    const nested = errors.find((error) => error.property === "initialBalance");
    expect(nested?.children?.some((child) => child.property === "amount")).toBe(true);
  });
});
