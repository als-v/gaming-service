import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "bun:test";

import { CreateWalletDto } from "./wallets/interface/dto/create-wallet.dto.js";
import { ValidationFailedException } from "./shared/errors/domain-http-exception.js";
import { ProblemDetailsExceptionFilter } from "./shared/errors/problem-details.filter.js";
import { validationExceptionFactory } from "./shared/errors/validation-exception-factory.js";

function buildPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });
}

interface ResponseSpy {
  status(status: number): ResponseSpy;
  json(body: unknown): void;
  captured: { status?: number; body?: unknown };
}

function buildResponseSpy(): ResponseSpy {
  const captured: { status?: number; body?: unknown } = {};
  const spy: ResponseSpy = {
    captured,
    status(status: number) {
      captured.status = status;
      return spy;
    },
    json(body: unknown) {
      captured.body = body;
    },
  };
  return spy;
}

describe("pipeline completo: ValidationPipe -> exceptionFactory -> ProblemDetailsExceptionFilter", () => {
  it("payload malformado produz o contrato RFC 7807 padronizado ponta a ponta", async () => {
    const pipe = buildPipe();

    let caught: unknown;
    try {
      await pipe.transform(
        { playerId: "", initialBalance: { amount: "25.000", currency: "brl" } },
        { type: "body", metatype: CreateWalletDto, data: "" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ValidationFailedException);

    const response = buildResponseSpy();
    const filter = new ProblemDetailsExceptionFilter();
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({}) }),
    };
    filter.catch(caught, host as never);

    expect(response.captured.status).toBe(400);
    const body = response.captured.body as {
      failureCode: string;
      errors: Array<{ field: string }>;
    };
    expect(body.failureCode).toBe("VALIDATION_ERROR");
    const fields = body.errors.map((e) => e.field);
    expect(fields).toContain("playerId");
    expect(fields).toContain("initialBalance.amount");
    expect(fields).toContain("initialBalance.currency");
  });

  it("payload válido passa sem lançar", async () => {
    const pipe = buildPipe();
    const result = await pipe.transform(
      {
        playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
        initialBalance: { amount: "1000.00", currency: "BRL" },
      },
      { type: "body", metatype: CreateWalletDto, data: "" },
    );
    expect(result).toBeInstanceOf(CreateWalletDto);
  });
});
