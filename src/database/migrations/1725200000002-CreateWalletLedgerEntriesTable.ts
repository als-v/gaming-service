import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWalletLedgerEntriesTable1725200000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "ledger_direction_enum" AS ENUM ('DEBIT', 'CREDIT')
    `);
    await queryRunner.query(`
      CREATE TABLE "wallet_ledger_entries" (
        "id" uuid NOT NULL,
        "wallet_id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "direction" "ledger_direction_enum" NOT NULL,
        "currency" varchar(3) NOT NULL,
        "amount_value" numeric(19,2) NOT NULL,
        "balance_before_value" numeric(19,2) NOT NULL,
        "balance_after_value" numeric(19,2) NOT NULL,
        "created_at" timestamptz NOT NULL,
        CONSTRAINT "PK_wallet_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallet_ledger_entries_wallet_id" FOREIGN KEY ("wallet_id") REFERENCES "wallets" ("id"),
        CONSTRAINT "FK_wallet_ledger_entries_transaction_id" FOREIGN KEY ("transaction_id") REFERENCES "wager_transactions" ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_wallet_ledger_entries_wallet_id_created_at_id"
        ON "wallet_ledger_entries" ("wallet_id", "created_at", "id")
    `);
    await queryRunner.query(`
      CREATE FUNCTION wallet_ledger_entries_block_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledger_entries is append-only: % is not permitted', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER wallet_ledger_entries_no_update
        BEFORE UPDATE ON "wallet_ledger_entries"
        FOR EACH ROW EXECUTE FUNCTION wallet_ledger_entries_block_mutation()
    `);
    await queryRunner.query(`
      CREATE TRIGGER wallet_ledger_entries_no_delete
        BEFORE DELETE ON "wallet_ledger_entries"
        FOR EACH ROW EXECUTE FUNCTION wallet_ledger_entries_block_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER wallet_ledger_entries_no_delete ON "wallet_ledger_entries"`,
    );
    await queryRunner.query(
      `DROP TRIGGER wallet_ledger_entries_no_update ON "wallet_ledger_entries"`,
    );
    await queryRunner.query(`DROP FUNCTION wallet_ledger_entries_block_mutation()`);
    await queryRunner.query(`DROP TABLE "wallet_ledger_entries"`);
    await queryRunner.query(`DROP TYPE "ledger_direction_enum"`);
  }
}
