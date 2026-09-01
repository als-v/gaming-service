import { describe, expect, it } from "bun:test";

import { NoOpProviderIdentityAdapter } from "../../shared/auth/no-op-provider-identity.adapter.js";
import { Money } from "../../shared/money/money.js";
import type { SubmitWagerTransactionCommand } from "../application/submit-wager-transaction.use-case.js";
import { WagerTransactionKind } from "../domain/wager-transaction-kind.enum.js";
import { WagerTransaction } from "../domain/wager-transaction.js";
import { SubmitWagerTransactionDto } from "./dto/submit-wager-transaction.dto.js";
import { ProviderWagerTransactionsController } from "./provider-wager-transactions.controller.js";
import { WagerTransactionsController } from "./wager-transactions.controller.js";

function buildTransaction(): WagerTransaction {
  const transaction = WagerTransaction.create({
    id: "0192f298-345e-7e38-af88-e43f851a819d",
    providerId: "provider-a",
    externalTransactionId: "transaction-123",
    idempotencyKey: "provider-a:transaction-123",
    payloadHash: "hash",
    walletId: "0192f291-27dd-7d3f-8071-5f8685deef37",
    playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    roundId: "round-987",
    gameId: "fortune-chimp",
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: "25.00", currency: "BRL" }),
    referenceExternalTransactionId: undefined,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
  });
  transaction.markProcessed(undefined, new Date("2026-09-01T00:00:01.000Z"));
  return transaction;
}

describe("WagerTransactionsController", () => {
  it("POST /wagering/transactions delega ao SubmitWagerTransactionUseCase", async () => {
    let receivedCommand: SubmitWagerTransactionCommand | undefined;
    const controller = new WagerTransactionsController(
      new NoOpProviderIdentityAdapter(),
      {
        execute: (command: SubmitWagerTransactionCommand) => {
          receivedCommand = command;
          return Promise.resolve({
            transaction: buildTransaction(),
            walletBalance: { amount: "975.00", currency: "BRL" },
            idempotentReplay: false,
          });
        },
      } as never,
      { execute: () => Promise.resolve(buildTransaction()) } as never,
    );
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

    const response = await controller.submit("provider-a:transaction-123", dto);

    expect(receivedCommand?.idempotencyKey).toBe("provider-a:transaction-123");
    expect(receivedCommand?.providerId).toBe("provider-a");
    expect(response.status).toBe("PROCESSED");
    expect(response.idempotentReplay).toBe(false);
    expect(response.balance).toEqual({ amount: "975.00", currency: "BRL" });
    expect(response.transactionId).toBe("0192f298-345e-7e38-af88-e43f851a819d");
  });

  it("GET /wagering/transactions/:transactionId delega ao GetWagerTransactionByIdUseCase", async () => {
    let receivedId: string | undefined;
    const controller = new WagerTransactionsController(
      new NoOpProviderIdentityAdapter(),
      { execute: () => Promise.resolve({}) } as never,
      {
        execute: (transactionId: string) => {
          receivedId = transactionId;
          return Promise.resolve(buildTransaction());
        },
      } as never,
    );

    const response = await controller.findOne("0192f298-345e-7e38-af88-e43f851a819d");

    expect(receivedId).toBe("0192f298-345e-7e38-af88-e43f851a819d");
    expect(response.transactionId).toBe("0192f298-345e-7e38-af88-e43f851a819d");
    expect(response.status).toBe("PROCESSED");
  });
});

describe("ProviderWagerTransactionsController", () => {
  it("GET /providers/:providerId/wagering/transactions/:externalTransactionId delega ao use case", async () => {
    let receivedArgs: [string, string] | undefined;
    const controller = new ProviderWagerTransactionsController({
      execute: (providerId: string, externalTransactionId: string) => {
        receivedArgs = [providerId, externalTransactionId];
        return Promise.resolve(buildTransaction());
      },
    } as never);

    const response = await controller.findOne("provider-a", "transaction-123");

    expect(receivedArgs).toEqual(["provider-a", "transaction-123"]);
    expect(response.providerId).toBe("provider-a");
    expect(response.externalTransactionId).toBe("transaction-123");
  });
});
