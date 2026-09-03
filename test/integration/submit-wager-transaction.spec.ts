import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../../src/database/database.config.js";
import { SubmitWagerTransactionUseCase } from "../../src/wagering/application/submit-wager-transaction.use-case.js";
import { WagerTransactionKind } from "../../src/wagering/domain/wager-transaction-kind.enum.js";
import { WagerTransactionStatus } from "../../src/wagering/domain/wager-transaction-status.enum.js";
import { WagerTransactionEntity } from "../../src/wagering/infrastructure/persistence/wager-transaction.entity.js";
import {
  InsufficientBalanceException,
  ReferenceAlreadyUsedException,
} from "../../src/shared/errors/domain-http-exception.js";
import { OutboxMessageEntity } from "../../src/shared/messaging/infrastructure/persistence/outbox-message.entity.js";
import { Wallet } from "../../src/wallets/domain/wallet.js";
import { Money } from "../../src/shared/money/money.js";
import { MetricsService } from "../../src/shared/observability/metrics.service.js";
import { WalletEntity } from "../../src/wallets/infrastructure/persistence/wallet.entity.js";
import { WalletLedgerEntryEntity } from "../../src/wallets/infrastructure/persistence/wallet-ledger-entry.entity.js";
import { WalletMapper } from "../../src/wallets/infrastructure/persistence/wallet.mapper.js";

describe("SubmitWagerTransactionUseCase com Postgres real (etapa 5 — Definition of Done)", () => {
  let dataSource: DataSource;
  let useCase: SubmitWagerTransactionUseCase;

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions());
    await dataSource.initialize();
    useCase = new SubmitWagerTransactionUseCase(dataSource, new MetricsService());
  });

  async function seedWallet(initialAmount: string, currency = "BRL"): Promise<string> {
    const wallet = Wallet.open({
      id: randomUUID(),
      playerId: randomUUID(),
      initialBalance: Money.from({ amount: initialAmount, currency }),
      now: new Date(),
    });
    await dataSource.getRepository(WalletEntity).insert(WalletMapper.toPersistence(wallet));
    return wallet.id;
  }

  afterAll(async () => {
    await dataSource.destroy();
  });

  it(
    "cenário obrigatório (seção 8): 100.00 BRL, duas apostas de 80.00 BRL em paralelo -> " +
      "exatamente uma PROCESSED (saldo 20.00), a outra REJECTED por saldo insuficiente",
    async () => {
      const walletId = await seedWallet("100.00");

      const buildCommand = (externalTransactionId: string) => ({
        idempotencyKey: `provider-a:${externalTransactionId}`,
        providerId: "provider-a",
        externalTransactionId,
        playerId: randomUUID(),
        walletId,
        roundId: "round-1",
        gameId: "game-1",
        kind: "BET" as const,
        money: { amount: "80.00", currency: "BRL" },
        referenceExternalTransactionId: undefined,
      });

      const results = await Promise.allSettled([
        useCase.execute(buildCommand(randomUUID())),
        useCase.execute(buildCommand(randomUUID())),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const processedResult = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof useCase.execute>>>)
        .value;
      expect(processedResult.transaction.status).toBe(WagerTransactionStatus.Processed);
      expect(processedResult.walletBalance).toEqual({ amount: "20.00", currency: "BRL" });

      const rejectionError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionError).toBeInstanceOf(InsufficientBalanceException);

      const walletEntity = await dataSource.getRepository(WalletEntity).findOneByOrFail({ id: walletId });
      expect(walletEntity.balanceAmount).toBe("20.00");

      const ledgerEntries = await dataSource
        .getRepository(WalletLedgerEntryEntity)
        .find({ where: { walletId } });
      expect(ledgerEntries).toHaveLength(1);

      const transactions = await dataSource
        .getRepository(WagerTransactionEntity)
        .find({ where: { walletId } });
      const statuses = transactions.map((t) => t.status).sort();
      expect(statuses).toEqual([WagerTransactionStatus.Processed, WagerTransactionStatus.Rejected].sort());
    },
  );

  it("50 requisições idênticas em paralelo (mesma Idempotency-Key) resultam em 1 débito e 49 replays", async () => {
    const walletId = await seedWallet("1000.00");
    const idempotencyKey = `provider-a:${randomUUID()}`;
    const command = {
      idempotencyKey,
      providerId: "provider-a",
      externalTransactionId: randomUUID(),
      playerId: randomUUID(),
      walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: "BET" as const,
      money: { amount: "10.00", currency: "BRL" },
      referenceExternalTransactionId: undefined,
    };

    const results = await Promise.all(Array.from({ length: 50 }, () => useCase.execute(command)));

    const replays = results.filter((r) => r.idempotentReplay);
    const nonReplays = results.filter((r) => !r.idempotentReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(49);

    const walletEntity = await dataSource.getRepository(WalletEntity).findOneByOrFail({ id: walletId });
    expect(walletEntity.balanceAmount).toBe("990.00");

    const ledgerEntries = await dataSource
      .getRepository(WalletLedgerEntryEntity)
      .find({ where: { walletId } });
    expect(ledgerEntries).toHaveLength(1);

    const transactions = await dataSource
      .getRepository(WagerTransactionEntity)
      .find({ where: { idempotencyKey } });
    expect(transactions).toHaveLength(1);
  });

  it(
    "replay de uma transação PROCESSED devolve o saldo observado no momento do processamento " +
      "original, não o saldo atual da wallet (regra 7)",
    async () => {
      const walletId = await seedWallet("100.00");
      const playerId = randomUUID();
      const betCommand = {
        idempotencyKey: `provider-a:${randomUUID()}`,
        providerId: "provider-a",
        externalTransactionId: randomUUID(),
        playerId,
        walletId,
        roundId: "round-1",
        gameId: "game-1",
        kind: "BET" as const,
        money: { amount: "80.00", currency: "BRL" },
        referenceExternalTransactionId: undefined,
      };

      const betResult = await useCase.execute(betCommand);
      expect(betResult.idempotentReplay).toBe(false);
      expect(betResult.walletBalance.amount).toBe("20.00");

      await useCase.execute({
        idempotencyKey: `provider-a:${randomUUID()}`,
        providerId: "provider-a",
        externalTransactionId: randomUUID(),
        playerId,
        walletId,
        roundId: "round-1",
        gameId: "game-1",
        kind: "WIN",
        money: { amount: "50.00", currency: "BRL" },
        referenceExternalTransactionId: undefined,
      });

      const walletEntity = await dataSource.getRepository(WalletEntity).findOneByOrFail({ id: walletId });
      expect(walletEntity.balanceAmount).toBe("70.00");

      const betReplay = await useCase.execute(betCommand);
      expect(betReplay.idempotentReplay).toBe(true);
      expect(betReplay.walletBalance.amount).toBe("20.00");
    },
  );

  it("duas wallets diferentes processadas em paralelo não se bloqueiam entre si (lock por linha, não global)", async () => {
    const walletIdA = await seedWallet("100.00");
    const walletIdB = await seedWallet("100.00");

    const buildCommand = (walletId: string, externalTransactionId: string) => ({
      idempotencyKey: `provider-a:${externalTransactionId}`,
      providerId: "provider-a",
      externalTransactionId,
      playerId: randomUUID(),
      walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: "BET" as const,
      money: { amount: "30.00", currency: "BRL" },
      referenceExternalTransactionId: undefined,
    });

    const [resultA, resultB] = await Promise.all([
      useCase.execute(buildCommand(walletIdA, randomUUID())),
      useCase.execute(buildCommand(walletIdB, randomUUID())),
    ]);

    expect(resultA.transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(resultB.transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(resultA.walletBalance).toEqual({ amount: "70.00", currency: "BRL" });
    expect(resultB.walletBalance).toEqual({ amount: "70.00", currency: "BRL" });
  });

  it("REFUND sem referência encontrada termina em PENDING_REFERENCE, não em erro", async () => {
    const walletId = await seedWallet("100.00");

    const result = await useCase.execute({
      idempotencyKey: `provider-a:${randomUUID()}`,
      providerId: "provider-a",
      externalTransactionId: randomUUID(),
      playerId: randomUUID(),
      walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: "REFUND",
      money: { amount: "10.00", currency: "BRL" },
      referenceExternalTransactionId: "non-existent-external-id",
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.PendingReference);

    const walletEntity = await dataSource.getRepository(WalletEntity).findOneByOrFail({ id: walletId });
    expect(walletEntity.balanceAmount).toBe("100.00");
  });

  it("REFUNDs concorrentes sobre a mesma referência processam exatamente uma vez (Adendo 6, Achado 2)", async () => {
    const walletId = await seedWallet("100.00");
    const playerId = randomUUID();

    const betResult = await useCase.execute({
      idempotencyKey: `provider-a:${randomUUID()}`,
      providerId: "provider-a",
      externalTransactionId: randomUUID(),
      playerId,
      walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: "BET",
      money: { amount: "50.00", currency: "BRL" },
      referenceExternalTransactionId: undefined,
    });
    const betExternalId = betResult.transaction.externalTransactionId;

    const buildRefundCommand = () => ({
      idempotencyKey: `provider-a:${randomUUID()}`,
      providerId: "provider-a",
      externalTransactionId: randomUUID(),
      playerId,
      walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: "REFUND" as const,
      money: { amount: "50.00", currency: "BRL" },
      referenceExternalTransactionId: betExternalId,
    });

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => useCase.execute(buildRefundCommand())),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(7);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ReferenceAlreadyUsedException);
    }

    const walletEntity = await dataSource.getRepository(WalletEntity).findOneByOrFail({ id: walletId });
    expect(walletEntity.balanceAmount).toBe("100.00");

    const ledgerEntries = await dataSource
      .getRepository(WalletLedgerEntryEntity)
      .find({ where: { walletId } });
    expect(ledgerEntries).toHaveLength(2);

    const refunds = await dataSource
      .getRepository(WagerTransactionEntity)
      .find({ where: { walletId, kind: WagerTransactionKind.Refund } });
    const processedRefunds = refunds.filter((t) => t.status === WagerTransactionStatus.Processed);
    expect(processedRefunds).toHaveLength(1);
  }, 15000);

  it("nenhum evento existe fora de uma outbox row commitada junto com o efeito financeiro", async () => {
    const walletId = await seedWallet("100.00");

    const result = await useCase.execute({
      idempotencyKey: `provider-a:${randomUUID()}`,
      providerId: "provider-a",
      externalTransactionId: randomUUID(),
      playerId: randomUUID(),
      walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: "BET",
      money: { amount: "10.00", currency: "BRL" },
      referenceExternalTransactionId: undefined,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Processed);

    const outboxMessages = await dataSource
      .getRepository(OutboxMessageEntity)
      .find({ where: { aggregateId: walletId } });
    expect(outboxMessages.length).toBeGreaterThanOrEqual(2);
    for (const message of outboxMessages) {
      expect(message.publishedAt).toBeNull();
    }
  });
});
