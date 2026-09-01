import { DomainError } from "../../shared/errors/domain-error.js";
import { FailureCode } from "../../shared/errors/failure-code.enum.js";
import type { WagerTransactionKind } from "./wager-transaction-kind.enum.js";
import type { WagerTransactionStatus } from "./wager-transaction-status.enum.js";

export class MissingReferenceError extends DomainError {
  readonly failureCode = FailureCode.ValidationError;

  constructor(kind: WagerTransactionKind) {
    super(`Transação do tipo "${kind}" exige "referenceExternalTransactionId".`);
  }
}

export class InvalidTransactionStateError extends Error {
  constructor(from: WagerTransactionStatus, to: WagerTransactionStatus) {
    super(`Transição inválida de "${from}" para "${to}".`);
    this.name = new.target.name;
  }
}

export class LedgerDirectionNotApplicableError extends Error {
  constructor(kind: WagerTransactionKind) {
    super(`Não é possível determinar a direção de ledger para o kind "${kind}".`);
    this.name = new.target.name;
  }
}
