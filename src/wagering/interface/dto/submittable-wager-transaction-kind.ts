export const SUBMITTABLE_WAGER_TRANSACTION_KINDS = [
  "BET",
  "WIN",
  "LOSS",
  "REFUND",
  "ROLLBACK",
] as const;

export type SubmittableWagerTransactionKind = (typeof SUBMITTABLE_WAGER_TRANSACTION_KINDS)[number];
