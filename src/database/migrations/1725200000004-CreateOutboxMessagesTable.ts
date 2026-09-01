import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOutboxMessagesTable1725200000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "outbox_messages" (
        "id" uuid NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "event_type" varchar NOT NULL,
        "payload" jsonb NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "attempts" integer NOT NULL,
        "next_attempt_at" timestamptz,
        "published_at" timestamptz,
        CONSTRAINT "PK_outbox_messages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_outbox_messages_published_at_next_attempt_at"
        ON "outbox_messages" ("published_at", "next_attempt_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "outbox_messages"`);
  }
}
