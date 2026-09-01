import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWagerTransactionsReferenceKindUniqueIndex1725200000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wager_transactions_reference_kind_processed"
        ON "wager_transactions" ("reference_transaction_id", "kind")
        WHERE "status" = 'PROCESSED' AND "kind" IN ('REFUND', 'ROLLBACK')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_wager_transactions_reference_kind_processed"`);
  }
}
