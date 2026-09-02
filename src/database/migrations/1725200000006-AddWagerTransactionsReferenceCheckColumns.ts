import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWagerTransactionsReferenceCheckColumns1725200000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wager_transactions"
        ADD COLUMN "reference_check_attempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN "next_reference_check_at" timestamptz
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_wager_transactions_pending_reference_due"
        ON "wager_transactions" ("next_reference_check_at")
        WHERE "status" = 'PENDING_REFERENCE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_wager_transactions_pending_reference_due"`);
    await queryRunner.query(`
      ALTER TABLE "wager_transactions"
        DROP COLUMN "reference_check_attempts",
        DROP COLUMN "next_reference_check_at"
    `);
  }
}
