import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../../src/database/database.config.js";
import { CreateWalletUseCase } from "../../src/wallets/application/create-wallet.use-case.js";
import { WalletAlreadyExistsException } from "../../src/shared/errors/domain-http-exception.js";
import { OutboxMessageEntity } from "../../src/shared/messaging/infrastructure/persistence/outbox-message.entity.js";
import { WagerTransactionKind } from "../../src/wagering/domain/wager-transaction-kind.enum.js";
import { WagerTransactionStatus } from "../../src/wagering/domain/wager-transaction-status.enum.js";
import { WagerTransactionEntity } from "../../src/wagering/infrastructure/persistence/wager-transaction.entity.js";
import { WalletLedgerEntryEntity } from "../../src/wallets/infrastructure/persistence/wallet-ledger-entry.entity.js";
import { WalletEntity } from "../../src/wallets/infrastructure/persistence/wallet.entity.js";

describe("CreateWalletUseCase com Postgres real", () => {
  let dataSource: DataSource;
  let useCase: CreateWalletUseCase;

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions());
    await dataSource.initialize();
    useCase = new CreateWalletUseCase(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it("cria wallet com saldo inicial positivo: transação OPENING processada, lançamento de crédito e eventos na outbox", async () => {
    const playerId = randomUUID();

    const wallet = await useCase.execute({ playerId, initialBalance: { amount: "500.00", currency: "BRL" } });

    expect(wallet.balance.toJSON()).toEqual({ amount: "500.00", currency: "BRL" });

    const walletEntity = await dataSource.getRepository(WalletEntity).findOneByOrFail({ id: wallet.id });
    expect(walletEntity.balanceAmount).toBe("500.00");
    expect(walletEntity.playerId).toBe(playerId);

    const openingTransactions = await dataSource
      .getRepository(WagerTransactionEntity)
      .find({ where: { walletId: wallet.id, kind: WagerTransactionKind.Opening } });
    expect(openingTransactions).toHaveLength(1);
    expect(openingTransactions[0]?.status).toBe(WagerTransactionStatus.Processed);

    const ledgerEntries = await dataSource
      .getRepository(WalletLedgerEntryEntity)
      .find({ where: { walletId: wallet.id } });
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]?.amountValue).toBe("500.00");

    const outboxMessages = await dataSource
      .getRepository(OutboxMessageEntity)
      .find({ where: { aggregateId: wallet.id } });
    expect(outboxMessages.length).toBeGreaterThanOrEqual(2);
    for (const message of outboxMessages) {
      expect(message.publishedAt).toBeNull();
    }
  });

  it("cria wallet com saldo inicial zero: sem transação OPENING, sem lançamento de ledger", async () => {
    const playerId = randomUUID();

    const wallet = await useCase.execute({ playerId, initialBalance: { amount: "0.00", currency: "BRL" } });

    expect(wallet.balance.toJSON()).toEqual({ amount: "0.00", currency: "BRL" });

    const openingTransactions = await dataSource
      .getRepository(WagerTransactionEntity)
      .find({ where: { walletId: wallet.id, kind: WagerTransactionKind.Opening } });
    expect(openingTransactions).toHaveLength(0);

    const ledgerEntries = await dataSource
      .getRepository(WalletLedgerEntryEntity)
      .find({ where: { walletId: wallet.id } });
    expect(ledgerEntries).toHaveLength(0);
  });

  it("segunda wallet para o mesmo (playerId, currency) é rejeitada com WalletAlreadyExistsException", async () => {
    const playerId = randomUUID();

    await useCase.execute({ playerId, initialBalance: { amount: "10.00", currency: "BRL" } });

    let caught: unknown;
    try {
      await useCase.execute({ playerId, initialBalance: { amount: "20.00", currency: "BRL" } });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WalletAlreadyExistsException);

    const wallets = await dataSource.getRepository(WalletEntity).find({ where: { playerId } });
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.balanceAmount).toBe("10.00");
  });

  it("mesmo playerId em moedas diferentes é permitido (unicidade é por par playerId+currency)", async () => {
    const playerId = randomUUID();

    const walletBrl = await useCase.execute({ playerId, initialBalance: { amount: "10.00", currency: "BRL" } });
    const walletUsd = await useCase.execute({ playerId, initialBalance: { amount: "10.00", currency: "USD" } });

    expect(walletBrl.id).not.toBe(walletUsd.id);

    const wallets = await dataSource.getRepository(WalletEntity).find({ where: { playerId } });
    expect(wallets).toHaveLength(2);
  });
});
