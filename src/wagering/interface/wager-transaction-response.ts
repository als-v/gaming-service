import type { MoneyDto } from "../../shared/money/money.dto.js";

export interface SubmitWagerTransactionResponse {
  transactionId: string;
  status: string;
  balance: MoneyDto;
  idempotentReplay: boolean;
}

export interface WagerTransactionResponse {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: MoneyDto;
  status: string;
  referenceTransactionId: string | null;
  failureCode: string | null;
  processedAt: string | null;
  createdAt: string;
}

export function placeholderWagerTransaction(
  overrides: Partial<WagerTransactionResponse>,
): WagerTransactionResponse {
  return {
    transactionId: "0192f298-345e-7e38-af88-e43f851a819d",
    providerId: "provider-a",
    externalTransactionId: "transaction-123",
    playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    walletId: "0192f291-27dd-7d3f-8071-5f8685deef37",
    roundId: "round-987",
    gameId: "fortune-chimp",
    kind: "BET",
    money: { amount: "25.00", currency: "BRL" },
    status: "PROCESSED",
    referenceTransactionId: null,
    failureCode: null,
    processedAt: new Date(0).toISOString(),
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}
