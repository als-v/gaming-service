import { InvalidCursorException } from "../../shared/errors/domain-http-exception.js";

export interface LedgerCursor {
  createdAt: string;
  id: string;
}

function isLedgerCursor(value: unknown): value is LedgerCursor {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["createdAt"] === "string" &&
    typeof (value as Record<string, unknown>)["id"] === "string"
  );
}

export function encodeLedgerCursor(cursor: LedgerCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeLedgerCursor(value: string): LedgerCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorException();
  }
  if (!isLedgerCursor(parsed)) {
    throw new InvalidCursorException();
  }
  return parsed;
}
