import type { MoneyDto } from "../../shared/money/money.dto.js";
import type { WagerTransaction } from "../domain/wager-transaction.js";

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

export function toWagerTransactionResponse(transaction: WagerTransaction): WagerTransactionResponse {
  return {
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    playerId: transaction.playerId,
    walletId: transaction.walletId,
    roundId: transaction.roundId,
    gameId: transaction.gameId,
    kind: transaction.kind,
    money: transaction.money.toJSON(),
    status: transaction.status,
    referenceTransactionId: transaction.referenceTransactionId ?? null,
    failureCode: transaction.failureCode ?? null,
    processedAt: transaction.processedAt === undefined ? null : transaction.processedAt.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
  };
}
