import { DomainError } from "../../shared/errors/domain-error.js";
import { FailureCode } from "../../shared/errors/failure-code.enum.js";
import type { Money } from "../../shared/money/money.js";
import type { LedgerDirection } from "./ledger-direction.enum.js";

export class InsufficientBalanceError extends DomainError {
  readonly failureCode = FailureCode.InsufficientBalance;

  constructor(walletId: string) {
    super(`Saldo insuficiente na wallet "${walletId}".`);
  }
}

export class UnbalancedLedgerEntryError extends Error {
  constructor(direction: LedgerDirection, balanceBefore: Money, money: Money, balanceAfter: Money) {
    super(
      `Lançamento de ledger não fecha: direção=${direction}, balanceBefore=${balanceBefore.toString()}, ` +
        `money=${money.toString()}, balanceAfter=${balanceAfter.toString()}.`,
    );
    this.name = new.target.name;
  }
}
