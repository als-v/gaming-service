import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity({ name: "outbox_messages" })
@Index("IDX_outbox_messages_published_at_next_attempt_at", ["publishedAt", "nextAttemptAt"])
export class OutboxMessageEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ name: "aggregate_id", type: "uuid" })
  aggregateId!: string;

  @Column({ name: "event_type", type: "varchar" })
  eventType!: string;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Column({ name: "occurred_at", type: "timestamptz" })
  occurredAt!: Date;

  @Column({ type: "integer" })
  attempts!: number;

  @Column({ name: "next_attempt_at", type: "timestamptz", nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: "published_at", type: "timestamptz", nullable: true })
  publishedAt!: Date | null;
}
