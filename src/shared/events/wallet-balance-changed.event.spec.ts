import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { Money } from "../money/money.js";
import { Wallet } from "../../wallets/domain/wallet.js";
import { LedgerDirection } from "../../wallets/domain/ledger-direction.enum.js";
import { WalletBalanceChanged } from "./wallet-balance-changed.event.js";

describe("WalletBalanceChanged", () => {
  it("from monta o evento a partir da wallet e do ledger entry produzidos por um débito", () => {
    const wallet = Wallet.open({
      id: randomUUID(),
      playerId: randomUUID(),
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
      now: new Date(),
    });
    const transactionId = randomUUID();
    const entry = wallet.debit({
      transactionId,
      money: Money.from({ amount: "80.00", currency: "BRL" }),
      at: new Date(),
    });

    const eventId = randomUUID();
    const correlationId = randomUUID();
    const occurredAt = new Date();
    const event = WalletBalanceChanged.from(wallet, entry, {
      eventId,
      correlationId,
      causationId: undefined,
      occurredAt,
    });

    expect(event.eventType).toBe("WalletBalanceChanged");
    expect(event.version).toBe(1);
    expect(event.aggregateId).toBe(wallet.id);
    expect(event.data).toEqual({
      walletId: wallet.id,
      transactionId,
      direction: LedgerDirection.Debit,
      money: { amount: "80.00", currency: "BRL" },
      balanceBefore: { amount: "100.00", currency: "BRL" },
      balanceAfter: { amount: "20.00", currency: "BRL" },
      walletVersion: 2,
    });
  });
});
