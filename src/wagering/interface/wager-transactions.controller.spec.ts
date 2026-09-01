import { describe, expect, it } from "bun:test";

import { NoOpProviderIdentityAdapter } from "../../shared/auth/no-op-provider-identity.adapter.js";
import { SubmitWagerTransactionDto } from "./dto/submit-wager-transaction.dto.js";
import { ProviderWagerTransactionsController } from "./provider-wager-transactions.controller.js";
import { WagerTransactionsController } from "./wager-transactions.controller.js";

describe("WagerTransactionsController", () => {
  const controller = new WagerTransactionsController(new NoOpProviderIdentityAdapter());

  it("POST /wagering/transactions responde PROCESSED com idempotentReplay false", () => {
    const dto: SubmitWagerTransactionDto = Object.assign(new SubmitWagerTransactionDto(), {
      providerId: "provider-a",
      externalTransactionId: "transaction-123",
      playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
      walletId: "0192f291-27dd-7d3f-8071-5f8685deef37",
      roundId: "round-987",
      gameId: "fortune-chimp",
      kind: "BET",
      money: { amount: "25.00", currency: "BRL" },
    });

    const response = controller.submit("provider-a:transaction-123", dto);

    expect(response.status).toBe("PROCESSED");
    expect(response.idempotentReplay).toBe(false);
    expect(response.balance).toEqual(dto.money);
    expect(typeof response.transactionId).toBe("string");
  });

  it("GET /wagering/transactions/:transactionId ecoa o id do path", () => {
    const response = controller.findOne("0192f298-345e-7e38-af88-e43f851a819d");
    expect(response.transactionId).toBe("0192f298-345e-7e38-af88-e43f851a819d");
  });
});

describe("ProviderWagerTransactionsController", () => {
  const controller = new ProviderWagerTransactionsController();

  it("GET /providers/:providerId/wagering/transactions/:externalTransactionId ecoa ambos os params", () => {
    const response = controller.findOne("provider-b", "ext-999");
    expect(response.providerId).toBe("provider-b");
    expect(response.externalTransactionId).toBe("ext-999");
  });
});
