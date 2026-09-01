import { HttpException, HttpStatus } from "@nestjs/common";

import { FailureCode } from "./failure-code.enum.js";
import type { ValidationErrorItem } from "./problem-details.js";

export abstract class DomainHttpException extends HttpException {
  abstract readonly failureCode: FailureCode;
  abstract readonly title: string;

  protected constructor(status: number, detail: string) {
    super(detail, status);
  }
}

export class ValidationFailedException extends DomainHttpException {
  readonly failureCode = FailureCode.ValidationError;
  readonly title = "Validation failed";
  readonly errors: ValidationErrorItem[];

  constructor(errors: ValidationErrorItem[]) {
    super(HttpStatus.BAD_REQUEST, "Payload não passou na validação.");
    this.errors = errors;
  }
}

export class IdempotencyKeyMissingException extends DomainHttpException {
  readonly failureCode = FailureCode.IdempotencyKeyMissing;
  readonly title = "Idempotency key missing";

  constructor() {
    super(HttpStatus.BAD_REQUEST, "Header Idempotency-Key é obrigatório.");
  }
}

export class IdempotencyConflictException extends DomainHttpException {
  readonly failureCode = FailureCode.IdempotencyConflict;
  readonly title = "Idempotency key conflict";

  constructor(idempotencyKey: string) {
    super(
      HttpStatus.CONFLICT,
      `A idempotency key "${idempotencyKey}" já foi usada com um payload diferente.`,
    );
  }
}

export class InvalidCursorException extends DomainHttpException {
  readonly failureCode = FailureCode.InvalidCursor;
  readonly title = "Invalid pagination cursor";

  constructor() {
    super(HttpStatus.BAD_REQUEST, "O cursor informado é inválido ou está corrompido.");
  }
}

export class WalletAlreadyExistsException extends DomainHttpException {
  readonly failureCode = FailureCode.WalletAlreadyExists;
  readonly title = "Wallet already exists";

  constructor(playerId: string, currency: string) {
    super(
      HttpStatus.CONFLICT,
      `Já existe uma wallet para playerId="${playerId}" e currency="${currency}".`,
    );
  }
}

export class WalletNotFoundException extends DomainHttpException {
  readonly failureCode = FailureCode.WalletNotFound;
  readonly title = "Wallet not found";

  constructor(walletId: string) {
    super(HttpStatus.NOT_FOUND, `Wallet "${walletId}" não encontrada.`);
  }
}

export class TransactionNotFoundException extends DomainHttpException {
  readonly failureCode = FailureCode.TransactionNotFound;
  readonly title = "Transaction not found";

  constructor(transactionId: string) {
    super(HttpStatus.NOT_FOUND, `Transação "${transactionId}" não encontrada.`);
  }
}

export class CurrencyMismatchException extends DomainHttpException {
  readonly failureCode = FailureCode.CurrencyMismatch;
  readonly title = "Currency mismatch";

  constructor(expected: string, received: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Moeda divergente: esperado "${expected}", recebido "${received}".`,
    );
  }
}

export class InsufficientBalanceException extends DomainHttpException {
  readonly failureCode = FailureCode.InsufficientBalance;
  readonly title = "Insufficient balance";

  constructor(walletId: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, `Saldo insuficiente na wallet "${walletId}".`);
  }
}

export class ReferenceNotFoundException extends DomainHttpException {
  readonly failureCode = FailureCode.ReferenceNotFound;
  readonly title = "Reference not found";

  constructor(referenceExternalTransactionId: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Referência "${referenceExternalTransactionId}" inexistente ou expirada.`,
    );
  }
}

export class ReferenceMismatchException extends DomainHttpException {
  readonly failureCode = FailureCode.ReferenceMismatch;
  readonly title = "Reference mismatch";

  constructor(referenceExternalTransactionId: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Referência "${referenceExternalTransactionId}" não corresponde ao provider/player/wallet/moeda/rodada ou valor da transação.`,
    );
  }
}

export class ReferenceWrongKindException extends DomainHttpException {
  readonly failureCode = FailureCode.ReferenceWrongKind;
  readonly title = "Reference wrong kind";

  constructor(referenceExternalTransactionId: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Referência "${referenceExternalTransactionId}" não pode ser revertida por esta operação (kind incompatível).`,
    );
  }
}

export class ReferenceAlreadyUsedException extends DomainHttpException {
  readonly failureCode = FailureCode.ReferenceAlreadyUsed;
  readonly title = "Reference already used";

  constructor(referenceExternalTransactionId: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Referência "${referenceExternalTransactionId}" já foi revertida por uma operação do mesmo tipo.`,
    );
  }
}

export class ReversalWouldOverdrawException extends DomainHttpException {
  readonly failureCode = FailureCode.ReversalWouldOverdraw;
  readonly title = "Reversal would overdraw wallet";

  constructor(walletId: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `A reversão deixaria a wallet "${walletId}" com saldo negativo.`,
    );
  }
}

export class TransientInfrastructureFailureException extends DomainHttpException {
  readonly failureCode = FailureCode.TransientInfrastructureFailure;
  readonly title = "Transient infrastructure failure";

  constructor(detail: string) {
    super(HttpStatus.SERVICE_UNAVAILABLE, detail);
  }
}
