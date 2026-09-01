import { describe, expect, it } from "bun:test";

import { InvalidCursorException } from "../../shared/errors/domain-http-exception.js";
import { decodeLedgerCursor, encodeLedgerCursor } from "./ledger-cursor.js";

describe("ledger cursor opaco", () => {
  it("faz round-trip de encode/decode preservando createdAt e id", () => {
    const cursor = { createdAt: "2026-09-01T12:00:00.000Z", id: "0192f298-345e-7e38-af88" };
    const encoded = encodeLedgerCursor(cursor);
    expect(decodeLedgerCursor(encoded)).toEqual(cursor);
  });

  it("produz um valor que não é JSON legível diretamente", () => {
    const encoded = encodeLedgerCursor({ createdAt: "2026-09-01T12:00:00.000Z", id: "abc" });
    expect(() => {
      JSON.parse(encoded);
    }).toThrow();
  });

  it("rejeita cursor com base64 inválido", () => {
    expect(() => decodeLedgerCursor("%%%not-base64%%%")).toThrow(InvalidCursorException);
  });

  it("rejeita cursor com JSON incompleto", () => {
    const encoded = Buffer.from(
      JSON.stringify({ createdAt: "2026-09-01T12:00:00.000Z" }),
      "utf8",
    ).toString("base64url");
    expect(() => decodeLedgerCursor(encoded)).toThrow(InvalidCursorException);
  });
});
