import { randomUUID } from "node:crypto";

import { CurrencyMismatchError } from "../../shared/money/money.errors.js";
import type { Money } from "../../shared/money/money.js";
import { LedgerDirection } from "./ledger-direction.enum.js";
import { InsufficientBalanceError } from "./wallet.errors.js";
import { WalletLedgerEntry } from "./wallet-ledger-entry.js";

export interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
  now: Date;
}

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplyMovementProps {
  transactionId: string;
  money: Money;
  at: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: OpenWalletProps): Wallet {
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      props.now,
      props.now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(props: ApplyMovementProps): WalletLedgerEntry {
    return this.applyMovement(LedgerDirection.Debit, props);
  }

  credit(props: ApplyMovementProps): WalletLedgerEntry {
    return this.applyMovement(LedgerDirection.Credit, props);
  }

  private applyMovement(direction: LedgerDirection, props: ApplyMovementProps): WalletLedgerEntry {
    this.assertSameCurrency(props.money);
    const balanceBefore = this._balance;
    const balanceAfter =
      direction === LedgerDirection.Debit
        ? balanceBefore.subtract(props.money)
        : balanceBefore.add(props.money);
    if (balanceAfter.isNegative()) {
      throw new InsufficientBalanceError(this.id);
    }
    const entry = WalletLedgerEntry.create({
      id: randomUUID(),
      walletId: this.id,
      transactionId: props.transactionId,
      direction,
      money: props.money,
      balanceBefore,
      balanceAfter,
      createdAt: props.at,
    });
    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = props.at;
    return entry;
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, money.currency);
    }
  }
}
