import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { DataSource, type Repository } from "typeorm";

import { buildTypeOrmOptions } from "../../src/database/database.config.js";
import { Money } from "../../src/shared/money/money.js";
import { Wallet } from "../../src/wallets/domain/wallet.js";
import { WalletEntity } from "../../src/wallets/infrastructure/persistence/wallet.entity.js";
import { WalletMapper } from "../../src/wallets/infrastructure/persistence/wallet.mapper.js";

describe("WalletMapper round-trip de Money via Postgres", () => {
  let dataSource: DataSource;
  let repository: Repository<WalletEntity>;
  const insertedIds: string[] = [];

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions());
    await dataSource.initialize();
    repository = dataSource.getRepository(WalletEntity);
  });

  afterEach(async () => {
    if (insertedIds.length > 0) {
      await repository.delete(insertedIds);
      insertedIds.length = 0;
    }
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it("preserva o valor exato de Money.toJSON() através de toPersistence -> INSERT -> SELECT -> toDomain", async () => {
    const amount = "12345678901234567.89";
    const wallet = Wallet.open({
      id: randomUUID(),
      playerId: randomUUID(),
      initialBalance: Money.from({ amount, currency: "USD" }),
      now: new Date(),
    });
    insertedIds.push(wallet.id);

    await repository.insert(WalletMapper.toPersistence(wallet));

    const raw = await repository.findOneByOrFail({ id: wallet.id });
    expect(typeof raw.balanceAmount).toBe("string");
    expect(raw.balanceAmount).toBe(amount);

    const rehydrated = WalletMapper.toDomain(raw);
    expect(rehydrated.balance.toJSON()).toEqual({ amount, currency: "USD" });
    expect(rehydrated.balance.equals(wallet.balance)).toBe(true);
  });

  it("preserva um valor com centavos não nulos e o menor incremento possível", async () => {
    const amount = "0.01";
    const wallet = Wallet.open({
      id: randomUUID(),
      playerId: randomUUID(),
      initialBalance: Money.from({ amount, currency: "BRL" }),
      now: new Date(),
    });
    insertedIds.push(wallet.id);

    await repository.insert(WalletMapper.toPersistence(wallet));

    const raw = await repository.findOneByOrFail({ id: wallet.id });
    const rehydrated = WalletMapper.toDomain(raw);
    expect(rehydrated.balance.toJSON()).toEqual({ amount, currency: "BRL" });
  });
});
