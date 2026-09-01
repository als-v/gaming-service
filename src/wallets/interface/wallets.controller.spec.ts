import { describe, expect, it } from "bun:test";

import { InvalidCursorException } from "../../shared/errors/domain-http-exception.js";
import { CreateWalletDto } from "./dto/create-wallet.dto.js";
import { GetLedgerQueryDto } from "./dto/get-ledger-query.dto.js";
import { encodeLedgerCursor } from "./ledger-cursor.js";
import { WalletsController } from "./wallets.controller.js";

describe("WalletsController", () => {
  const controller = new WalletsController();

  it("POST /wallets ecoa playerId e initialBalance, version 1", () => {
    const dto: CreateWalletDto = Object.assign(new CreateWalletDto(), {
      playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
      initialBalance: { amount: "1000.00", currency: "BRL" },
    });
    const response = controller.create(dto);

    expect(response.playerId).toBe(dto.playerId);
    expect(response.balance).toEqual(dto.initialBalance);
    expect(response.version).toBe(1);
    expect(typeof response.id).toBe("string");
    expect(response.id.length).toBeGreaterThan(0);
  });

  it("GET /wallets/:walletId ecoa o walletId do path", () => {
    const response = controller.findOne("0192f291-27dd-7d3f-8071-5f8685deef37");
    expect(response.id).toBe("0192f291-27dd-7d3f-8071-5f8685deef37");
    expect(response.balance.currency).toBe("BRL");
  });

  it("GET /wallets/:walletId/ledger aplica limit default de 50", () => {
    const response = controller.ledger("wallet-1", Object.assign(new GetLedgerQueryDto(), {}));
    expect(response.limit).toBe(50);
    expect(response.items).toEqual([]);
    expect(response.nextCursor).toBeNull();
  });

  it("GET /wallets/:walletId/ledger respeita limit explícito", () => {
    const response = controller.ledger(
      "wallet-1",
      Object.assign(new GetLedgerQueryDto(), { limit: 10 }),
    );
    expect(response.limit).toBe(10);
  });

  it("GET /wallets/:walletId/ledger aceita cursor opaco válido", () => {
    const cursor = encodeLedgerCursor({ createdAt: "2026-09-01T00:00:00.000Z", id: "abc" });
    expect(() =>
      controller.ledger("wallet-1", Object.assign(new GetLedgerQueryDto(), { cursor })),
    ).not.toThrow();
  });

  it("GET /wallets/:walletId/ledger rejeita cursor malformado", () => {
    expect(() =>
      controller.ledger("wallet-1", Object.assign(new GetLedgerQueryDto(), { cursor: "%%%" })),
    ).toThrow(InvalidCursorException);
  });

  it("POST /wallets/:walletId/reconciliation ecoa walletId e é consistente por padrão", () => {
    const response = controller.reconcile("wallet-1");
    expect(response.walletId).toBe("wallet-1");
    expect(response.consistent).toBe(true);
  });
});
