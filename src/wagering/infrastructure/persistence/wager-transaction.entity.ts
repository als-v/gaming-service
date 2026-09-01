import { Column, Entity, Index, PrimaryColumn, Unique } from "typeorm";

import { WagerTransactionKind } from "../../domain/wager-transaction-kind.enum.js";
import { WagerTransactionStatus } from "../../domain/wager-transaction-status.enum.js";

@Entity({ name: "wager_transactions" })
@Unique("UQ_wager_transactions_idempotency_key", ["idempotencyKey"])
@Unique("UQ_wager_transactions_provider_external", ["providerId", "externalTransactionId"])
@Index("IDX_wager_transactions_status_kind", ["status", "kind"])
export class WagerTransactionEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ name: "provider_id", type: "varchar" })
  providerId!: string;

  @Column({ name: "external_transaction_id", type: "varchar" })
  externalTransactionId!: string;

  @Column({ name: "idempotency_key", type: "varchar" })
  idempotencyKey!: string;

  @Column({ name: "payload_hash", type: "text" })
  payloadHash!: string;

  @Column({ name: "wallet_id", type: "uuid" })
  walletId!: string;

  @Column({ name: "player_id", type: "uuid" })
  playerId!: string;

  @Column({ name: "round_id", type: "varchar" })
  roundId!: string;

  @Column({ name: "game_id", type: "varchar" })
  gameId!: string;

  @Column({ type: "enum", enum: WagerTransactionKind, enumName: "wager_transaction_kind_enum" })
  kind!: WagerTransactionKind;

  @Column({ name: "amount_value", type: "numeric", precision: 19, scale: 2 })
  amountValue!: string;

  @Column({ name: "amount_currency", type: "varchar", length: 3 })
  amountCurrency!: string;

  @Column({ name: "reference_external_transaction_id", type: "varchar", nullable: true })
  referenceExternalTransactionId!: string | null;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({
    type: "enum",
    enum: WagerTransactionStatus,
    enumName: "wager_transaction_status_enum",
  })
  status!: WagerTransactionStatus;

  @Column({ name: "reference_transaction_id", type: "uuid", nullable: true })
  referenceTransactionId!: string | null;

  @Column({ name: "failure_code", type: "varchar", length: 64, nullable: true })
  failureCode!: string | null;

  @Column({ name: "processed_at", type: "timestamptz", nullable: true })
  processedAt!: Date | null;
}
