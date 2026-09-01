import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInboxMessagesTable1725200000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inbox_messages" (
        "consumer_name" varchar NOT NULL,
        "message_id" varchar NOT NULL,
        "payload_hash" text NOT NULL,
        "received_at" timestamptz NOT NULL,
        "processed_at" timestamptz,
        CONSTRAINT "PK_inbox_messages" PRIMARY KEY ("consumer_name", "message_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "inbox_messages"`);
  }
}
