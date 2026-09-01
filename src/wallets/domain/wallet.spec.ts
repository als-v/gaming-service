import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { CurrencyMismatchError } from "../../shared/money/money.errors.js";
import { Money } from "../../shared/money/money.js";
import { LedgerDirection } from "./ledger-direction.enum.js";
import { InsufficientBalanceError } from "./wallet.errors.js";
import { Wallet } from "./wallet.js";

function money(amount: string, currency = "BRL"): Money {
  return Money.from({ amount, currency });
}

function openWallet(initialBalance = "100.00"): Wallet {
  return Wallet.open({
    id: randomUUID(),
    playerId: randomUUID(),
    initialBalance: money(initialBalance),
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
}

describe("Wallet", () => {
  it("open inicia com version 1 e o saldo informado", () => {
    const wallet = openWallet("100.00");
    expect(wallet.version).toBe(1);
    expect(wallet.balance.equals(money("100.00"))).toBe(true);
  });

  it("debit reduz o saldo, incrementa version e retorna o ledger entry correspondente", () => {
    const wallet = openWallet("100.00");
    const entry = wallet.debit({
      transactionId: randomUUID(),
      money: money("80.00"),
      at: new Date(),
    });
    expect(wallet.balance.equals(money("20.00"))).toBe(true);
    expect(wallet.version).toBe(2);
    expect(entry.direction).toBe(LedgerDirection.Debit);
    expect(entry.balanceBefore.equals(money("100.00"))).toBe(true);
    expect(entry.balanceAfter.equals(money("20.00"))).toBe(true);
    expect(entry.isBalanced()).toBe(true);
  });

  it("credit aumenta o saldo, incrementa version e retorna o ledger entry correspondente", () => {
    const wallet = openWallet("100.00");
    const entry = wallet.credit({
      transactionId: randomUUID(),
      money: money("25.00"),
      at: new Date(),
    });
    expect(wallet.balance.equals(money("125.00"))).toBe(true);
    expect(wallet.version).toBe(2);
    expect(entry.direction).toBe(LedgerDirection.Credit);
  });

  it("debit lança InsufficientBalanceError e não muda o estado da wallet quando o saldo ficaria negativo", () => {
    const wallet = openWallet("100.00");
    expect(() =>
      wallet.debit({ transactionId: randomUUID(), money: money("150.00"), at: new Date() }),
    ).toThrow(InsufficientBalanceError);
    expect(wallet.balance.equals(money("100.00"))).toBe(true);
    expect(wallet.version).toBe(1);
  });

  it("debit até zerar o saldo é permitido (saldo nunca negativo, mas pode chegar a zero)", () => {
    const wallet = openWallet("100.00");
    const entry = wallet.debit({
      transactionId: randomUUID(),
      money: money("100.00"),
      at: new Date(),
    });
    expect(wallet.balance.isZero()).toBe(true);
    expect(entry.balanceAfter.isZero()).toBe(true);
  });

  it("debit/credit em moeda diferente da wallet lança CurrencyMismatchError", () => {
    const wallet = openWallet("100.00");
    expect(() =>
      wallet.debit({ transactionId: randomUUID(), money: money("10.00", "USD"), at: new Date() }),
    ).toThrow(CurrencyMismatchError);
  });

  it("rehydrate reconstrói o estado sem revalidar invariantes", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const wallet = Wallet.rehydrate({
      id: randomUUID(),
      playerId: randomUUID(),
      currency: "BRL",
      balance: money("42.00"),
      version: 7,
      createdAt: now,
      updatedAt: now,
    });
    expect(wallet.balance.equals(money("42.00"))).toBe(true);
    expect(wallet.version).toBe(7);
  });

  it("cenário obrigatório: dois débitos de 80.00 sobre saldo de 100.00 — o segundo é rejeitado", () => {
    const wallet = openWallet("100.00");
    wallet.debit({ transactionId: randomUUID(), money: money("80.00"), at: new Date() });
    expect(() =>
      wallet.debit({ transactionId: randomUUID(), money: money("80.00"), at: new Date() }),
    ).toThrow(InsufficientBalanceError);
    expect(wallet.balance.equals(money("20.00"))).toBe(true);
    expect(wallet.version).toBe(2);
  });
});
