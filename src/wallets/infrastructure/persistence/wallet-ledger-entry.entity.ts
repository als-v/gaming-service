import { Column, Entity, Index, PrimaryColumn } from "typeorm";

import { LedgerDirection } from "../../domain/ledger-direction.enum.js";

@Entity({ name: "wallet_ledger_entries" })
@Index("IDX_wallet_ledger_entries_wallet_id_created_at_id", ["walletId", "createdAt", "id"])
export class WalletLedgerEntryEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ name: "wallet_id", type: "uuid" })
  walletId!: string;

  @Column({ name: "transaction_id", type: "uuid" })
  transactionId!: string;

  @Column({ type: "enum", enum: LedgerDirection, enumName: "ledger_direction_enum" })
  direction!: LedgerDirection;

  @Column({ type: "varchar", length: 3 })
  currency!: string;

  @Column({ name: "amount_value", type: "numeric", precision: 19, scale: 2 })
  amountValue!: string;

  @Column({ name: "balance_before_value", type: "numeric", precision: 19, scale: 2 })
  balanceBeforeValue!: string;

  @Column({ name: "balance_after_value", type: "numeric", precision: 19, scale: 2 })
  balanceAfterValue!: string;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
