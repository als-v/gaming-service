import { GetQueueAttributesCommand, type SQSClient } from "@aws-sdk/client-sqs";
import { Controller, Get, Header, Inject } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { SQS_CLIENT } from "../messaging/infrastructure/sqs-client.provider.js";
import { OutboxMessageEntity } from "../messaging/infrastructure/persistence/outbox-message.entity.js";
import { SqsQueueUrlResolver } from "../messaging/infrastructure/sqs-queue-url.resolver.js";
import { buildSqsQueueNames } from "../messaging/infrastructure/sqs.config.js";
import { MetricsService } from "./metrics.service.js";

@Controller("metrics")
export class MetricsController {
  private readonly queueNames = buildSqsQueueNames();

  constructor(
    private readonly metrics: MetricsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(SQS_CLIENT) private readonly sqsClient: SQSClient,
    private readonly queueUrlResolver: SqsQueueUrlResolver,
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async scrape(): Promise<string> {
    await Promise.all([this.refreshOutboxLag(), this.refreshDlqDepth()]);
    return this.metrics.registry.metrics();
  }

  private async refreshOutboxLag(): Promise<void> {
    const now = new Date();
    const row = await this.dataSource
      .createQueryBuilder(OutboxMessageEntity, "m")
      .select("MIN(m.occurred_at)", "oldest")
      .where("m.published_at IS NULL")
      .andWhere("(m.next_attempt_at IS NULL OR m.next_attempt_at <= :now)", { now })
      .getRawOne<{ oldest: Date | null }>();
    const oldest = row?.oldest ?? null;
    const lagSeconds = oldest === null ? 0 : (now.getTime() - new Date(oldest).getTime()) / 1000;
    this.metrics.outboxLagSeconds.set(lagSeconds);
  }

  private async refreshDlqDepth(): Promise<void> {
    const dlqQueues = [
      { label: "wager-transactions", queueName: this.queueNames.wagerTransactionsDlqQueueName },
      {
        label: "wager-transaction-events",
        queueName: this.queueNames.wagerTransactionEventsDlqQueueName,
      },
    ];
    await Promise.all(
      dlqQueues.map(async ({ label, queueName }) => {
        const queueUrl = await this.queueUrlResolver.resolve(queueName);
        const response = await this.sqsClient.send(
          new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: ["ApproximateNumberOfMessages"],
          }),
        );
        const count = Number(response.Attributes?.ApproximateNumberOfMessages ?? "0");
        this.metrics.dlqMessages.labels(label).set(count);
      }),
    );
  }
}
