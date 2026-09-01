import { DomainError } from "../errors/domain-error.js";
import { FailureCode } from "../errors/failure-code.enum.js";

export class InvalidMoneyAmountError extends DomainError {
  readonly failureCode = FailureCode.ValidationError;

  constructor(amount: string) {
    super(
      `"${amount}" não é um valor monetário válido (esperado string decimal não negativa com 2 casas).`,
    );
  }
}

export class InvalidCurrencyCodeError extends DomainError {
  readonly failureCode = FailureCode.ValidationError;

  constructor(currency: string) {
    super(
      `"${currency}" não é um código de moeda válido (esperado ISO-4217 de 3 letras maiúsculas).`,
    );
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly failureCode = FailureCode.CurrencyMismatch;

  constructor(expected: string, actual: string) {
    super(`Moedas incompatíveis: esperado "${expected}", recebido "${actual}".`);
  }
}
