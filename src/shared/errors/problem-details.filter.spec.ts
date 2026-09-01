import { ArgumentsHost, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "bun:test";

import { FailureCode } from "./failure-code.enum.js";
import {
  IdempotencyKeyMissingException,
  ValidationFailedException,
} from "./domain-http-exception.js";
import { ProblemDetailsExceptionFilter } from "./problem-details.filter.js";

function buildHost(): { host: ArgumentsHost; captured: { status?: number; body?: unknown } } {
  const captured: { status?: number; body?: unknown } = {};
  const response = {
    status(status: number) {
      captured.status = status;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe("ProblemDetailsExceptionFilter", () => {
  const filter = new ProblemDetailsExceptionFilter();

  it("mapeia DomainHttpException para o contrato RFC 7807", () => {
    const { host, captured } = buildHost();
    filter.catch(new IdempotencyKeyMissingException(), host);

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body).toMatchObject({
      type: "https://docs.internal/errors/idempotency-key-missing",
      title: "Idempotency key missing",
      status: HttpStatus.BAD_REQUEST,
      failureCode: FailureCode.IdempotencyKeyMissing,
    });
    expect(typeof (captured.body as { traceId: string }).traceId).toBe("string");
  });

  it("inclui a lista de erros de validação quando a exceção é ValidationFailedException", () => {
    const { host, captured } = buildHost();
    filter.catch(
      new ValidationFailedException([{ field: "amount", constraints: ["deve ser decimal"] }]),
      host,
    );

    expect(captured.body).toMatchObject({
      failureCode: FailureCode.ValidationError,
      errors: [{ field: "amount", constraints: ["deve ser decimal"] }],
    });
  });

  it("mapeia HttpException genérica preservando o status original", () => {
    const { host, captured } = buildHost();
    filter.catch(new NotFoundException("rota inexistente"), host);

    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body).toMatchObject({
      failureCode: FailureCode.UnexpectedError,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it("mapeia erro desconhecido para 500", () => {
    const { host, captured } = buildHost();
    filter.catch(new Error("boom"), host);

    expect(captured.status).toBe(500);
    expect(captured.body).toMatchObject({
      failureCode: FailureCode.InternalError,
      status: 500,
    });
  });

  it("preserva a mensagem original de uma HttpException não pertencente ao domínio", () => {
    const { host, captured } = buildHost();
    filter.catch(new HttpException("algo específico do framework", HttpStatus.FORBIDDEN), host);

    expect(captured.status).toBe(HttpStatus.FORBIDDEN);
    expect((captured.body as { detail: string }).detail).toBe("algo específico do framework");
  });
});
