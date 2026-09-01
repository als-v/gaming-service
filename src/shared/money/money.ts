import { Decimal } from "decimal.js";

import { CURRENCY_CODE_PATTERN, MONEY_AMOUNT_PATTERN } from "./money-format.js";
import {
  CurrencyMismatchError,
  InvalidCurrencyCodeError,
  InvalidMoneyAmountError,
} from "./money.errors.js";

const SCALE = 2;

const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -SCALE,
  toExpPos: 30,
});

export interface MoneyProps {
  amount: string;
  currency: string;
}

export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    if (!MONEY_AMOUNT_PATTERN.test(props.amount)) {
      throw new InvalidMoneyAmountError(props.amount);
    }
    return new Money(new MoneyDecimal(props.amount), Money.assertValidCurrency(props.currency));
  }

  static zero(currency: string): Money {
    return new Money(new MoneyDecimal(0), Money.assertValidCurrency(currency));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return this.withValue(this.value.plus(other.value));
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return this.withValue(this.value.minus(other.value));
  }

  negate(): Money {
    return this.withValue(this.value.negated());
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return { amount: this.value.toFixed(SCALE), currency: this.currency };
  }

  toString(): string {
    return `${this.value.toFixed(SCALE)} ${this.currency}`;
  }

  private withValue(value: Decimal): Money {
    return new Money(value, this.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  private static assertValidCurrency(currency: string): string {
    if (!CURRENCY_CODE_PATTERN.test(currency)) {
      throw new InvalidCurrencyCodeError(currency);
    }
    return currency;
  }
}
