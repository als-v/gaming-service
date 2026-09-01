import { describe, expect, it } from "bun:test";

import {
  CurrencyMismatchError,
  InvalidCurrencyCodeError,
  InvalidMoneyAmountError,
} from "./money.errors.js";
import { Money } from "./money.js";

describe("Money", () => {
  it("cria a partir de amount/currency válidos e serializa de volta", () => {
    const money = Money.from({ amount: "25.00", currency: "BRL" });
    expect(money.toJSON()).toEqual({ amount: "25.00", currency: "BRL" });
    expect(money.toString()).toBe("25.00 BRL");
  });

  it("zero() cria um valor nulo na moeda informada", () => {
    const zero = Money.zero("BRL");
    expect(zero.isZero()).toBe(true);
    expect(zero.toJSON()).toEqual({ amount: "0.00", currency: "BRL" });
  });

  it.each([
    ["3 casas decimais", "25.000"],
    ["notação científica", "2.5e1"],
    ["valor negativo", "-25.00"],
    ["string vazia", ""],
    ["sem casas decimais", "25"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
  ])("rejeita amount inválido: %s", (_label, amount) => {
    expect(() => Money.from({ amount, currency: "BRL" })).toThrow(InvalidMoneyAmountError);
  });

  it.each([
    ["minúscula", "brl"],
    ["4 letras", "BRLL"],
    ["vazio", ""],
  ])("rejeita currency inválida: %s", (_label, currency) => {
    expect(() => Money.from({ amount: "25.00", currency })).toThrow(InvalidCurrencyCodeError);
  });

  it("add soma valores na mesma moeda e retorna uma nova instância", () => {
    const a = Money.from({ amount: "10.00", currency: "BRL" });
    const b = Money.from({ amount: "5.50", currency: "BRL" });
    const sum = a.add(b);
    expect(sum.toJSON()).toEqual({ amount: "15.50", currency: "BRL" });
    expect(a.toJSON()).toEqual({ amount: "10.00", currency: "BRL" });
  });

  it("subtract permite resultado negativo (uso interno, ex.: verificação de saldo)", () => {
    const a = Money.from({ amount: "10.00", currency: "BRL" });
    const b = Money.from({ amount: "15.00", currency: "BRL" });
    const diff = a.subtract(b);
    expect(diff.toJSON()).toEqual({ amount: "-5.00", currency: "BRL" });
    expect(diff.isNegative()).toBe(true);
  });

  it("negate inverte o sinal", () => {
    const money = Money.from({ amount: "10.00", currency: "BRL" });
    expect(money.negate().toJSON()).toEqual({ amount: "-10.00", currency: "BRL" });
  });

  it.each([
    ["add", (a: Money, b: Money) => a.add(b)],
    ["subtract", (a: Money, b: Money) => a.subtract(b)],
    ["isLessThan", (a: Money, b: Money) => a.isLessThan(b)],
  ])("%s lança CurrencyMismatchError entre moedas diferentes", (_label, operation) => {
    const brl = Money.from({ amount: "10.00", currency: "BRL" });
    const usd = Money.from({ amount: "10.00", currency: "USD" });
    expect(() => operation(brl, usd)).toThrow(CurrencyMismatchError);
  });

  it("equals compara valor e moeda", () => {
    const a = Money.from({ amount: "10.00", currency: "BRL" });
    const b = Money.from({ amount: "10.00", currency: "BRL" });
    const c = Money.from({ amount: "10.00", currency: "USD" });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("isPositive/isNegative/isZero refletem o sinal", () => {
    expect(Money.from({ amount: "1.00", currency: "BRL" }).isPositive()).toBe(true);
    expect(Money.from({ amount: "0.00", currency: "BRL" }).isZero()).toBe(true);
    expect(Money.from({ amount: "1.00", currency: "BRL" }).negate().isNegative()).toBe(true);
  });
});
