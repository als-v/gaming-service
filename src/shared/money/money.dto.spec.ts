import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "bun:test";

import { MoneyDto } from "./money.dto.js";

describe("MoneyDto", () => {
  it("aceita amount decimal com 2 casas e currency ISO-4217", async () => {
    const dto = plainToInstance(MoneyDto, { amount: "25.00", currency: "BRL" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([
    ["3 casas decimais", { amount: "25.000", currency: "BRL" }],
    ["notação científica", { amount: "2.5e1", currency: "BRL" }],
    ["valor negativo", { amount: "-25.00", currency: "BRL" }],
    ["string vazia", { amount: "", currency: "BRL" }],
    ["sem casas decimais", { amount: "25", currency: "BRL" }],
    ["NaN", { amount: "NaN", currency: "BRL" }],
  ])("rejeita amount inválido: %s", async (_label, payload) => {
    const dto = plainToInstance(MoneyDto, payload);
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "amount")).toBe(true);
  });

  it.each([
    ["minúscula", "brl"],
    ["4 letras", "BRLL"],
    ["vazio", ""],
  ])("rejeita currency inválida: %s", async (_label, currency) => {
    const dto = plainToInstance(MoneyDto, { amount: "25.00", currency });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "currency")).toBe(true);
  });
});
