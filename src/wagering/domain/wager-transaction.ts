import { FailureCode } from "../../shared/errors/failure-code.enum.js";
import type { Money } from "../../shared/money/money.js";
import { LedgerDirection } from "../../wallets/domain/ledger-direction.enum.js";
import { WagerTransactionKind } from "./wager-transaction-kind.enum.js";
import { WagerTransactionStatus } from "./wager-transaction-status.enum.js";
import {
  InvalidTransactionStateError,
  LedgerDirectionNotApplicableError,
  MissingReferenceError,
} from "./wager-transaction.errors.js";

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId: string | undefined;
  createdAt: Date;
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId: string | undefined;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId: string | undefined;
  failureCode: FailureCode | undefined;
  processedAt: Date | undefined;
  referenceCheckAttempts: number;
  nextReferenceCheckAt: Date | undefined;
}

export const REFERENCE_RECHECK_DELAYS_MS: readonly number[] = [
  60_000, 300_000, 900_000, 1_800_000, 3_600_000,
];
export const MAX_REFERENCE_CHECK_ATTEMPTS = REFERENCE_RECHECK_DELAYS_MS.length;

function referenceRecheckDelayMs(attempt: number): number {
  const delay = REFERENCE_RECHECK_DELAYS_MS[attempt];
  if (delay === undefined) {
    throw new RangeError(`Nenhum atraso de recheck de referência configurado para a tentativa ${attempt}.`);
  }
  return delay;
}

const VALID_TRANSITIONS: Readonly<
  Record<WagerTransactionStatus, ReadonlySet<WagerTransactionStatus>>
> = {
  [WagerTransactionStatus.Pending]: new Set([
    WagerTransactionStatus.Processed,
    WagerTransactionStatus.Rejected,
    WagerTransactionStatus.PendingReference,
    WagerTransactionStatus.Failed,
  ]),
  [WagerTransactionStatus.PendingReference]: new Set([
    WagerTransactionStatus.Processed,
    WagerTransactionStatus.Rejected,
  ]),
  [WagerTransactionStatus.Processed]: new Set(),
  [WagerTransactionStatus.Rejected]: new Set(),
  [WagerTransactionStatus.Failed]: new Set(),
};

const REVERSIBLE_ORIGINAL_DIRECTION: Readonly<
  Partial<Record<WagerTransactionKind, LedgerDirection>>
> = {
  [WagerTransactionKind.Bet]: LedgerDirection.Debit,
  [WagerTransactionKind.Win]: LedgerDirection.Credit,
  [WagerTransactionKind.Refund]: LedgerDirection.Credit,
};

function opposite(direction: LedgerDirection): LedgerDirection {
  return direction === LedgerDirection.Debit ? LedgerDirection.Credit : LedgerDirection.Debit;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId: string | undefined,
    private _failureCode: FailureCode | undefined,
    private _processedAt: Date | undefined,
    private _referenceCheckAttempts: number,
    private _nextReferenceCheckAt: Date | undefined,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if (
      WagerTransaction.requiresReferenceFor(props.kind) &&
      props.referenceExternalTransactionId === undefined
    ) {
      throw new MissingReferenceError(props.kind);
    }
    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      props.createdAt,
      WagerTransactionStatus.Pending,
      undefined,
      undefined,
      undefined,
      0,
      undefined,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      state.money,
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
      state.referenceCheckAttempts,
      state.nextReferenceCheckAt,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  get referenceCheckAttempts(): number {
    return this._referenceCheckAttempts;
  }

  get nextReferenceCheckAt(): Date | undefined {
    return this._nextReferenceCheckAt;
  }

  markProcessed(referenceTransactionId: string | undefined, at: Date): void {
    this.assertTransition(WagerTransactionStatus.Processed);
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
  }

  markPendingReference(now: Date): void {
    this.assertTransition(WagerTransactionStatus.PendingReference);
    this._status = WagerTransactionStatus.PendingReference;
    this._referenceCheckAttempts = 0;
    this._nextReferenceCheckAt = new Date(now.getTime() + referenceRecheckDelayMs(0));
  }

  recordFailedReferenceCheck(now: Date): void {
    if (this._status !== WagerTransactionStatus.PendingReference) {
      throw new InvalidTransactionStateError(this._status, WagerTransactionStatus.PendingReference);
    }
    const attemptNumber = this._referenceCheckAttempts + 1;
    this._referenceCheckAttempts = attemptNumber;
    if (attemptNumber >= MAX_REFERENCE_CHECK_ATTEMPTS) {
      this._nextReferenceCheckAt = undefined;
      this.reject(FailureCode.ReferenceTimeout);
      return;
    }
    this._nextReferenceCheckAt = new Date(now.getTime() + referenceRecheckDelayMs(attemptNumber));
  }

  reject(code: FailureCode): void {
    this.assertTransition(WagerTransactionStatus.Rejected);
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
  }

  fail(code: FailureCode): void {
    this.assertTransition(WagerTransactionStatus.Failed);
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
  }

  isTerminal(): boolean {
    return VALID_TRANSITIONS[this._status].size === 0;
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return WagerTransaction.requiresReferenceFor(this.kind);
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Rollback: {
        const originalDirection =
          reference === undefined ? undefined : REVERSIBLE_ORIGINAL_DIRECTION[reference.kind];
        if (originalDirection === undefined) {
          throw new LedgerDirectionNotApplicableError(this.kind);
        }
        return opposite(originalDirection);
      }
      case WagerTransactionKind.Loss:
        throw new LedgerDirectionNotApplicableError(this.kind);
    }
  }

  private static requiresReferenceFor(kind: WagerTransactionKind): boolean {
    return kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback;
  }

  private assertTransition(target: WagerTransactionStatus): void {
    if (!VALID_TRANSITIONS[this._status].has(target)) {
      throw new InvalidTransactionStateError(this._status, target);
    }
  }
}
