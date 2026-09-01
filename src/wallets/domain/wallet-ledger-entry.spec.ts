import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { Money } from "../../shared/money/money.js";
import { LedgerDirection } from "./ledger-direction.enum.js";
import { UnbalancedLedgerEntryError } from "./wallet.errors.js";
import { WalletLedgerEntry } from "./wallet-ledger-entry.js";

function money(amount: string): Money {
  return Money.from({ amount, currency: "BRL" });
}

describe("WalletLedgerEntry", () => {
  it("create aceita um lançamento CREDIT cuja aritmética fecha", () => {
    const entry = WalletLedgerEntry.create({
      id: randomUUID(),
      walletId: randomUUID(),
      transactionId: randomUUID(),
      direction: LedgerDirection.Credit,
      money: money("25.00"),
      balanceBefore: money("100.00"),
      balanceAfter: money("125.00"),
      createdAt: new Date(),
    });
    expect(entry.isBalanced()).toBe(true);
  });

  it("create aceita um lançamento DEBIT cuja aritmética fecha", () => {
    const entry = WalletLedgerEntry.create({
      id: randomUUID(),
      walletId: randomUUID(),
      transactionId: randomUUID(),
      direction: LedgerDirection.Debit,
      money: money("80.00"),
      balanceBefore: money("100.00"),
      balanceAfter: money("20.00"),
      createdAt: new Date(),
    });
    expect(entry.isBalanced()).toBe(true);
  });

  it("create rejeita um lançamento cuja aritmética não fecha", () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: randomUUID(),
        walletId: randomUUID(),
        transactionId: randomUUID(),
        direction: LedgerDirection.Credit,
        money: money("25.00"),
        balanceBefore: money("100.00"),
        balanceAfter: money("999.00"),
        createdAt: new Date(),
      }),
    ).toThrow(UnbalancedLedgerEntryError);
  });

  it("rehydrate reconstrói o estado sem revalidar a aritmética", () => {
    const state = {
      id: randomUUID(),
      walletId: randomUUID(),
      transactionId: randomUUID(),
      direction: LedgerDirection.Credit,
      money: money("25.00"),
      balanceBefore: money("100.00"),
      balanceAfter: money("999.00"),
      createdAt: new Date(),
    };
    const entry = WalletLedgerEntry.rehydrate(state);
    expect(entry.isBalanced()).toBe(false);
    expect(entry.id).toBe(state.id);
  });
});
