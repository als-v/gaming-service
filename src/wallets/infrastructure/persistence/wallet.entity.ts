import { Column, Entity, PrimaryColumn, Unique } from "typeorm";

@Entity({ name: "wallets" })
@Unique("UQ_wallets_player_id_currency", ["playerId", "currency"])
export class WalletEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ name: "player_id", type: "uuid" })
  playerId!: string;

  @Column({ type: "varchar", length: 3 })
  currency!: string;

  @Column({ name: "balance_amount", type: "numeric", precision: 19, scale: 2 })
  balanceAmount!: string;

  @Column({ type: "integer" })
  version!: number;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
