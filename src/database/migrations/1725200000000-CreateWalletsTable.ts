import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWalletsTable1725200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        "currency" varchar(3) NOT NULL,
        "balance_amount" numeric(19,2) NOT NULL,
        "version" integer NOT NULL,
        "created_at" timestamptz NOT NULL,
        "updated_at" timestamptz NOT NULL,
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_player_id_currency" UNIQUE ("player_id", "currency"),
        CONSTRAINT "CHK_wallets_balance_amount_non_negative" CHECK ("balance_amount" >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "wallets"`);
  }
}
