import type { MoneyDto } from "../../../shared/money/money.dto.js";

export interface WalletResponse {
  id: string;
  playerId: string;
  balance: MoneyDto;
  version: number;
}

export interface LedgerEntryResponse {
  id: string;
  walletId: string;
  transactionId: string;
  direction: "DEBIT" | "CREDIT";
  money: MoneyDto;
  balanceBefore: MoneyDto;
  balanceAfter: MoneyDto;
  createdAt: string;
}

export interface LedgerPageResponse {
  items: LedgerEntryResponse[];
  limit: number;
  nextCursor: string | null;
}

export interface ReconciliationResponse {
  walletId: string;
  storedBalance: MoneyDto;
  calculatedBalance: MoneyDto;
  difference: MoneyDto;
  consistent: boolean;
  checkedEntries: number;
}
