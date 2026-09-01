import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { FailureCode } from "../../shared/errors/failure-code.enum.js";
import { Money } from "../../shared/money/money.js";
import { LedgerDirection } from "../../wallets/domain/ledger-direction.enum.js";
import { WagerTransactionKind } from "./wager-transaction-kind.enum.js";
import { WagerTransactionStatus } from "./wager-transaction-status.enum.js";
import {
  InvalidTransactionStateError,
  LedgerDirectionNotApplicableError,
  MissingReferenceError,
} from "./wager-transaction.errors.js";
import { type CreateWagerTransactionProps, WagerTransaction } from "./wager-transaction.js";

function money(amount: string): Money {
  return Money.from({ amount, currency: "BRL" });
}

function baseProps(
  overrides: Partial<CreateWagerTransactionProps> = {},
): CreateWagerTransactionProps {
  return {
    id: randomUUID(),
    providerId: "provider-a",
    externalTransactionId: "transaction-123",
    idempotencyKey: randomUUID(),
    payloadHash: "hash-1",
    walletId: randomUUID(),
    playerId: randomUUID(),
    roundId: "round-1",
    gameId: "fortune-chimp",
    kind: WagerTransactionKind.Bet,
    money: money("25.00"),
    referenceExternalTransactionId: undefined,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("WagerTransaction", () => {
  it("create nasce em PENDING", () => {
    const transaction = WagerTransaction.create(baseProps());
    expect(transaction.status).toBe(WagerTransactionStatus.Pending);
    expect(transaction.isTerminal()).toBe(false);
  });

  it.each([WagerTransactionKind.Refund, WagerTransactionKind.Rollback])(
    "create exige referenceExternalTransactionId para %s",
    (kind) => {
      expect(() =>
        WagerTransaction.create(baseProps({ kind, referenceExternalTransactionId: undefined })),
      ).toThrow(MissingReferenceError);
    },
  );

  it.each([WagerTransactionKind.Refund, WagerTransactionKind.Rollback])(
    "create aceita %s quando referenceExternalTransactionId é informado",
    (kind) => {
      const transaction = WagerTransaction.create(
        baseProps({ kind, referenceExternalTransactionId: "external-ref-1" }),
      );
      expect(transaction.requiresReference()).toBe(true);
    },
  );

  it("create permite kind OPENING (a restrição de submissão é imposta na borda de entrada, não no domínio)", () => {
    const transaction = WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Opening }));
    expect(transaction.kind).toBe(WagerTransactionKind.Opening);
  });

  it("affectsBalance é false somente para LOSS", () => {
    expect(
      WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Loss })).affectsBalance(),
    ).toBe(false);
    expect(
      WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Bet })).affectsBalance(),
    ).toBe(true);
  });

  it("markProcessed transiciona PENDING -> PROCESSED e registra processedAt/referenceTransactionId", () => {
    const transaction = WagerTransaction.create(baseProps());
    const referenceTransactionId = randomUUID();
    const processedAt = new Date();
    transaction.markProcessed(referenceTransactionId, processedAt);
    expect(transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(transaction.referenceTransactionId).toBe(referenceTransactionId);
    expect(transaction.processedAt).toBe(processedAt);
    expect(transaction.isTerminal()).toBe(true);
  });

  it("reject transiciona PENDING -> REJECTED e registra o failureCode", () => {
    const transaction = WagerTransaction.create(baseProps());
    transaction.reject(FailureCode.InsufficientBalance);
    expect(transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(transaction.failureCode).toBe(FailureCode.InsufficientBalance);
    expect(transaction.isTerminal()).toBe(true);
  });

  it("markPendingReference transiciona PENDING -> PENDING_REFERENCE, e dali é possível ir para PROCESSED ou REJECTED", () => {
    const transaction = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: "external-ref-1",
      }),
    );
    transaction.markPendingReference();
    expect(transaction.status).toBe(WagerTransactionStatus.PendingReference);
    transaction.markProcessed(randomUUID(), new Date());
    expect(transaction.status).toBe(WagerTransactionStatus.Processed);
  });

  it("fail transiciona PENDING -> FAILED", () => {
    const transaction = WagerTransaction.create(baseProps());
    transaction.fail(FailureCode.TransientInfrastructureFailure);
    expect(transaction.status).toBe(WagerTransactionStatus.Failed);
    expect(transaction.failureCode).toBe(FailureCode.TransientInfrastructureFailure);
  });

  it("PENDING_REFERENCE não pode ir para FAILED nem para si mesma", () => {
    const transaction = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: "external-ref-1",
      }),
    );
    transaction.markPendingReference();
    expect(() => transaction.fail(FailureCode.TransientInfrastructureFailure)).toThrow(
      InvalidTransactionStateError,
    );
    expect(() => transaction.markPendingReference()).toThrow(InvalidTransactionStateError);
  });

  it.each([
    WagerTransactionStatus.Processed,
    WagerTransactionStatus.Rejected,
    WagerTransactionStatus.Failed,
  ])(
    "transicionar uma transação em estado terminal (%s) lança InvalidTransactionStateError",
    (terminalStatus) => {
      const transaction = WagerTransaction.create(baseProps());
      if (terminalStatus === WagerTransactionStatus.Processed)
        transaction.markProcessed(undefined, new Date());
      if (terminalStatus === WagerTransactionStatus.Rejected)
        transaction.reject(FailureCode.ValidationError);
      if (terminalStatus === WagerTransactionStatus.Failed)
        transaction.fail(FailureCode.InternalError);

      expect(transaction.isTerminal()).toBe(true);
      expect(() => transaction.markProcessed(undefined, new Date())).toThrow(
        InvalidTransactionStateError,
      );
      expect(() => transaction.reject(FailureCode.ValidationError)).toThrow(
        InvalidTransactionStateError,
      );
      expect(() => transaction.fail(FailureCode.InternalError)).toThrow(
        InvalidTransactionStateError,
      );
      expect(() => transaction.markPendingReference()).toThrow(InvalidTransactionStateError);
    },
  );

  it("matchesPayload compara o payloadHash", () => {
    const transaction = WagerTransaction.create(baseProps({ payloadHash: "hash-1" }));
    expect(transaction.matchesPayload("hash-1")).toBe(true);
    expect(transaction.matchesPayload("hash-2")).toBe(false);
  });

  describe("ledgerDirectionFor", () => {
    it("OPENING e WIN e REFUND são CREDIT; BET é DEBIT", () => {
      expect(
        WagerTransaction.create(
          baseProps({ kind: WagerTransactionKind.Opening }),
        ).ledgerDirectionFor(),
      ).toBe(LedgerDirection.Credit);
      expect(
        WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Win })).ledgerDirectionFor(),
      ).toBe(LedgerDirection.Credit);
      expect(
        WagerTransaction.create(
          baseProps({ kind: WagerTransactionKind.Refund, referenceExternalTransactionId: "r-1" }),
        ).ledgerDirectionFor(),
      ).toBe(LedgerDirection.Credit);
      expect(
        WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Bet })).ledgerDirectionFor(),
      ).toBe(LedgerDirection.Debit);
    });

    it("LOSS lança LedgerDirectionNotApplicableError", () => {
      const transaction = WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Loss }));
      expect(() => transaction.ledgerDirectionFor()).toThrow(LedgerDirectionNotApplicableError);
    });

    it.each([
      ["BET", WagerTransactionKind.Bet, LedgerDirection.Debit, LedgerDirection.Credit],
      ["WIN", WagerTransactionKind.Win, LedgerDirection.Credit, LedgerDirection.Debit],
      ["REFUND", WagerTransactionKind.Refund, LedgerDirection.Credit, LedgerDirection.Debit],
    ])(
      "ROLLBACK de um %s inverte a direção original",
      (_label, referenceKind, originalDirection, expected) => {
        const reference = WagerTransaction.create(
          baseProps({
            kind: referenceKind,
            referenceExternalTransactionId:
              referenceKind === WagerTransactionKind.Refund ? "r-1" : undefined,
          }),
        );
        expect(reference.ledgerDirectionFor()).toBe(originalDirection);
        const rollback = WagerTransaction.create(
          baseProps({ kind: WagerTransactionKind.Rollback, referenceExternalTransactionId: "r-1" }),
        );
        expect(rollback.ledgerDirectionFor(reference)).toBe(expected);
      },
    );

    it("ROLLBACK sem reference, ou referenciando LOSS/OPENING/ROLLBACK, lança LedgerDirectionNotApplicableError", () => {
      const rollback = WagerTransaction.create(
        baseProps({ kind: WagerTransactionKind.Rollback, referenceExternalTransactionId: "r-1" }),
      );
      expect(() => rollback.ledgerDirectionFor()).toThrow(LedgerDirectionNotApplicableError);

      const lossReference = WagerTransaction.create(baseProps({ kind: WagerTransactionKind.Loss }));
      expect(() => rollback.ledgerDirectionFor(lossReference)).toThrow(
        LedgerDirectionNotApplicableError,
      );

      const openingReference = WagerTransaction.create(
        baseProps({ kind: WagerTransactionKind.Opening }),
      );
      expect(() => rollback.ledgerDirectionFor(openingReference)).toThrow(
        LedgerDirectionNotApplicableError,
      );
    });
  });

  it("rehydrate reconstrói o estado sem revalidar regras", () => {
    const now = new Date();
    const transaction = WagerTransaction.rehydrate({
      id: randomUUID(),
      providerId: "provider-a",
      externalTransactionId: "transaction-123",
      idempotencyKey: randomUUID(),
      payloadHash: "hash-1",
      walletId: randomUUID(),
      playerId: randomUUID(),
      roundId: "round-1",
      gameId: "fortune-chimp",
      kind: WagerTransactionKind.Refund,
      money: money("25.00"),
      referenceExternalTransactionId: undefined,
      createdAt: now,
      status: WagerTransactionStatus.Processed,
      referenceTransactionId: randomUUID(),
      failureCode: undefined,
      processedAt: now,
    });
    expect(transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(transaction.isTerminal()).toBe(true);
  });
});
