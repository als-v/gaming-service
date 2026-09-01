import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "bun:test";

import { CreateWalletDto } from "../../wallets/interface/dto/create-wallet.dto.js";
import { ValidationFailedException } from "./domain-http-exception.js";
import { validationExceptionFactory } from "./validation-exception-factory.js";

describe("validationExceptionFactory", () => {
  it("achata erros aninhados em uma lista com caminho pontilhado", async () => {
    const dto = plainToInstance(CreateWalletDto, {
      playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
      initialBalance: { amount: "1000.000", currency: "brl" },
    });
    const errors = await validate(dto);
    const exception = validationExceptionFactory(errors);

    expect(exception).toBeInstanceOf(ValidationFailedException);
    const fields = exception.errors.map((error) => error.field);
    expect(fields).toContain("initialBalance.amount");
    expect(fields).toContain("initialBalance.currency");
  });
});
