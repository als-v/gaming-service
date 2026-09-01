import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWagerTransactionsTable1725200000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "wager_transaction_kind_enum" AS ENUM (
        'OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "wager_transaction_status_enum" AS ENUM (
        'PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "wager_transactions" (
        "id" uuid NOT NULL,
        "provider_id" varchar NOT NULL,
        "external_transaction_id" varchar NOT NULL,
        "idempotency_key" varchar NOT NULL,
        "payload_hash" text NOT NULL,
        "wallet_id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        "round_id" varchar NOT NULL,
        "game_id" varchar NOT NULL,
        "kind" "wager_transaction_kind_enum" NOT NULL,
        "amount_value" numeric(19,2) NOT NULL,
        "amount_currency" varchar(3) NOT NULL,
        "reference_external_transaction_id" varchar,
        "created_at" timestamptz NOT NULL,
        "status" "wager_transaction_status_enum" NOT NULL,
        "reference_transaction_id" uuid,
        "failure_code" varchar(64),
        "processed_at" timestamptz,
        CONSTRAINT "PK_wager_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wager_transactions_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "UQ_wager_transactions_provider_external" UNIQUE ("provider_id", "external_transaction_id"),
        CONSTRAINT "FK_wager_transactions_wallet_id" FOREIGN KEY ("wallet_id") REFERENCES "wallets" ("id"),
        CONSTRAINT "FK_wager_transactions_reference_transaction_id" FOREIGN KEY ("reference_transaction_id") REFERENCES "wager_transactions" ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_wager_transactions_status_kind" ON "wager_transactions" ("status", "kind")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "wager_transactions"`);
    await queryRunner.query(`DROP TYPE "wager_transaction_status_enum"`);
    await queryRunner.query(`DROP TYPE "wager_transaction_kind_enum"`);
  }
}
