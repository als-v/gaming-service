import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "bun:test";

import { IdempotencyKeyMissingException } from "../../shared/errors/domain-http-exception.js";
import { IdempotencyKeyGuard } from "./idempotency-key.guard.js";

function buildContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe("IdempotencyKeyGuard", () => {
  const guard = new IdempotencyKeyGuard();

  it("permite a requisição quando o header está presente", () => {
    expect(
      guard.canActivate(buildContext({ "idempotency-key": "provider-a:transaction-123" })),
    ).toBe(true);
  });

  it("rejeita quando o header está ausente", () => {
    expect(() => guard.canActivate(buildContext({}))).toThrow(IdempotencyKeyMissingException);
  });

  it("rejeita quando o header está em branco", () => {
    expect(() => guard.canActivate(buildContext({ "idempotency-key": "   " }))).toThrow(
      IdempotencyKeyMissingException,
    );
  });
});
