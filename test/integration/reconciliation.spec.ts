import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../../src/database/database.config.js";
import { CreateWalletUseCase } from "../../src/wallets/application/create-wallet.use-case.js";
import { ReconciliationUseCase } from "../../src/wallets/application/reconciliation.use-case.js";
import { SubmitWagerTransactionUseCase } from "../../src/wagering/application/submit-wager-transaction.use-case.js";
import { WalletNotFoundException } from "../../src/shared/errors/domain-http-exception.js";
import { MetricsService } from "../../src/shared/observability/metrics.service.js";
import { WalletEntity } from "../../src/wallets/infrastructure/persistence/wallet.entity.js";

describe("ReconciliationUseCase com Postgres real", () => {
  let dataSource: DataSource;
  let reconciliationUseCase: ReconciliationUseCase;
  let createWalletUseCase: CreateWalletUseCase;
  let submitWagerTransactionUseCase: SubmitWagerTransactionUseCase;

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions());
    await dataSource.initialize();
    reconciliationUseCase = new ReconciliationUseCase(dataSource, new MetricsService());
    createWalletUseCase = new CreateWalletUseCase(dataSource);
    submitWagerTransactionUseCase = new SubmitWagerTransactionUseCase(dataSource, new MetricsService());
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it("wallet com saldo consistente com o ledger retorna consistent=true e difference zero", async () => {
    const playerId = randomUUID();
    const wallet = await createWalletUseCase.execute({
      playerId,
      initialBalance: { amount: "100.00", currency: "BRL" },
    });

    await submitWagerTransactionUseCase.execute({
      idempotencyKey: `provider-a:${randomUUID()}`,
      providerId: "provider-a",
      externalTransactionId: randomUUID(),
      playerId,
      walletId: wallet.id,
      roundId: "round-1",
      gameId: "game-1",
      kind: "BET",
      money: { amount: "30.00", currency: "BRL" },
      referenceExternalTransactionId: undefined,
    });

    const result = await reconciliationUseCase.execute(wallet.id);

    expect(result.consistent).toBe(true);
    expect(result.storedBalance.toJSON()).toEqual({ amount: "70.00", currency: "BRL" });
    expect(result.calculatedBalance.toJSON()).toEqual({ amount: "70.00", currency: "BRL" });
    expect(result.difference.toJSON()).toEqual({ amount: "0.00", currency: "BRL" });
    expect(result.checkedEntries).toBe(2);
  });

  it("wallet inexistente lança WalletNotFoundException", async () => {
    let caught: unknown;
    try {
      await reconciliationUseCase.execute(randomUUID());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WalletNotFoundException);
  });

  it("divergência entre saldo armazenado e soma do ledger é detectada (consistent=false), sem autocorreção", async () => {
    const playerId = randomUUID();
    const wallet = await createWalletUseCase.execute({
      playerId,
      initialBalance: { amount: "100.00", currency: "BRL" },
    });

    await dataSource
      .getRepository(WalletEntity)
      .update(wallet.id, { balanceAmount: "999.00" });

    const result = await reconciliationUseCase.execute(wallet.id);

    expect(result.consistent).toBe(false);
    expect(result.storedBalance.toJSON()).toEqual({ amount: "999.00", currency: "BRL" });
    expect(result.calculatedBalance.toJSON()).toEqual({ amount: "100.00", currency: "BRL" });
    expect(result.difference.toJSON()).toEqual({ amount: "899.00", currency: "BRL" });

    const walletEntity = await dataSource.getRepository(WalletEntity).findOneByOrFail({ id: wallet.id });
    expect(walletEntity.balanceAmount).toBe("999.00");
  });
});
