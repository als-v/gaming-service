import { describe, expect, it } from "bun:test";

import { InvalidCursorException } from "../../shared/errors/domain-http-exception.js";
import type { CreateWalletCommand } from "../application/create-wallet.use-case.js";
import type { GetWalletLedgerPage, GetWalletLedgerQuery } from "../application/get-wallet-ledger.use-case.js";
import type { ReconciliationResult } from "../application/reconciliation.use-case.js";
import { Money } from "../../shared/money/money.js";
import { LedgerDirection } from "../domain/ledger-direction.enum.js";
import { Wallet } from "../domain/wallet.js";
import { WalletLedgerEntry } from "../domain/wallet-ledger-entry.js";
import { CreateWalletDto } from "./dto/create-wallet.dto.js";
import { GetLedgerQueryDto } from "./dto/get-ledger-query.dto.js";
import { encodeLedgerCursor } from "./ledger-cursor.js";
import { WalletsController } from "./wallets.controller.js";

const WALLET_ID = "0192f291-27dd-7d3f-8071-5f8685deef37";
const PLAYER_ID = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

function buildWallet(): Wallet {
  return Wallet.open({
    id: WALLET_ID,
    playerId: PLAYER_ID,
    initialBalance: Money.from({ amount: "1000.00", currency: "BRL" }),
    now: new Date("2026-09-01T00:00:00.000Z"),
  });
}

function buildController(overrides: {
  create?: (command: CreateWalletCommand) => Promise<Wallet>;
  getWallet?: (walletId: string) => Promise<Wallet>;
  getLedger?: (query: GetWalletLedgerQuery) => Promise<GetWalletLedgerPage>;
  reconcile?: (walletId: string) => Promise<ReconciliationResult>;
}): WalletsController {
  return new WalletsController(
    { execute: overrides.create ?? (() => Promise.resolve(buildWallet())) } as never,
    { execute: overrides.getWallet ?? (() => Promise.resolve(buildWallet())) } as never,
    {
      execute: overrides.getLedger ?? (() => Promise.resolve({ items: [], nextCursor: undefined })),
    } as never,
    {
      execute:
        overrides.reconcile ??
        (() =>
          Promise.resolve({
            walletId: WALLET_ID,
            storedBalance: Money.zero("BRL"),
            calculatedBalance: Money.zero("BRL"),
            difference: Money.zero("BRL"),
            consistent: true,
            checkedEntries: 0,
          })),
    } as never,
  );
}

describe("WalletsController", () => {
  it("POST /wallets delega ao CreateWalletUseCase e devolve o resultado", async () => {
    let received: CreateWalletCommand | undefined;
    const controller = buildController({
      create: (command) => {
        received = command;
        return Promise.resolve(buildWallet());
      },
    });
    const dto: CreateWalletDto = Object.assign(new CreateWalletDto(), {
      playerId: PLAYER_ID,
      initialBalance: { amount: "1000.00", currency: "BRL" },
    });

    const response = await controller.create(dto);

    expect(received).toEqual({ playerId: PLAYER_ID, initialBalance: dto.initialBalance });
    expect(response).toEqual({
      id: WALLET_ID,
      playerId: PLAYER_ID,
      balance: { amount: "1000.00", currency: "BRL" },
      version: 1,
    });
  });

  it("GET /wallets/:walletId delega ao GetWalletUseCase", async () => {
    let receivedId: string | undefined;
    const controller = buildController({
      getWallet: (walletId) => {
        receivedId = walletId;
        return Promise.resolve(buildWallet());
      },
    });

    const response = await controller.findOne(WALLET_ID);

    expect(receivedId).toBe(WALLET_ID);
    expect(response.id).toBe(WALLET_ID);
    expect(response.balance.currency).toBe("BRL");
  });

  it("GET /wallets/:walletId/ledger verifica a wallet e aplica limit default de 50", async () => {
    let receivedQuery: GetWalletLedgerQuery | undefined;
    const controller = buildController({
      getLedger: (query) => {
        receivedQuery = query;
        return Promise.resolve({ items: [], nextCursor: undefined });
      },
    });

    const response = await controller.ledger(WALLET_ID, Object.assign(new GetLedgerQueryDto(), {}));

    expect(receivedQuery?.limit).toBe(50);
    expect(receivedQuery?.cursor).toBeUndefined();
    expect(response.limit).toBe(50);
    expect(response.items).toEqual([]);
    expect(response.nextCursor).toBeNull();
  });

  it("GET /wallets/:walletId/ledger respeita limit explícito e mapeia itens/nextCursor", async () => {
    const entry = WalletLedgerEntry.create({
      id: "entry-1",
      walletId: WALLET_ID,
      transactionId: "tx-1",
      direction: LedgerDirection.Credit,
      money: Money.from({ amount: "10.00", currency: "BRL" }),
      balanceBefore: Money.from({ amount: "0.00", currency: "BRL" }),
      balanceAfter: Money.from({ amount: "10.00", currency: "BRL" }),
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    const controller = buildController({
      getLedger: () =>
        Promise.resolve({
          items: [entry],
          nextCursor: { createdAt: "2026-09-01T00:00:00.000Z", id: "entry-1" },
        }),
    });

    const response = await controller.ledger(
      WALLET_ID,
      Object.assign(new GetLedgerQueryDto(), { limit: 10 }),
    );

    expect(response.limit).toBe(10);
    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.id).toBe("entry-1");
    expect(response.nextCursor).not.toBeNull();
  });

  it("GET /wallets/:walletId/ledger aceita cursor opaco válido", async () => {
    const controller = buildController({});
    const cursor = encodeLedgerCursor({ createdAt: "2026-09-01T00:00:00.000Z", id: "abc" });

    const response = await controller.ledger(
      WALLET_ID,
      Object.assign(new GetLedgerQueryDto(), { cursor }),
    );

    expect(response).toBeDefined();
  });

  it("GET /wallets/:walletId/ledger rejeita cursor malformado", async () => {
    const controller = buildController({});
    let caught: unknown;

    try {
      await controller.ledger(WALLET_ID, Object.assign(new GetLedgerQueryDto(), { cursor: "%%%" }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidCursorException);
  });

  it("POST /wallets/:walletId/reconciliation delega ao ReconciliationUseCase", async () => {
    const controller = buildController({
      reconcile: () =>
        Promise.resolve({
          walletId: WALLET_ID,
          storedBalance: Money.from({ amount: "10.00", currency: "BRL" }),
          calculatedBalance: Money.from({ amount: "5.00", currency: "BRL" }),
          difference: Money.from({ amount: "5.00", currency: "BRL" }),
          consistent: false,
          checkedEntries: 3,
        }),
    });

    const response = await controller.reconcile(WALLET_ID);

    expect(response.walletId).toBe(WALLET_ID);
    expect(response.consistent).toBe(false);
    expect(response.checkedEntries).toBe(3);
  });
});
