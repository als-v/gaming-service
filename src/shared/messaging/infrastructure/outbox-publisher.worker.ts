import { SendMessageCommand, type SQSClient } from "@aws-sdk/client-sqs";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { OutboxMessage } from "../outbox-message.js";
import { OutboxMessageEntity } from "./persistence/outbox-message.entity.js";
import { OutboxMessageMapper } from "./persistence/outbox-message.mapper.js";
import { SQS_CLIENT } from "./sqs-client.provider.js";
import { SqsQueueUrlResolver } from "./sqs-queue-url.resolver.js";
import { buildSqsQueueNames } from "./sqs.config.js";

const POLL_INTERVAL_MS = 1_500;
const BATCH_SIZE = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class OutboxPublisherWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherWorker.name);
  private readonly destinationQueueName = buildSqsQueueNames().wagerTransactionEventsQueueName;
  private stopped = false;
  private loopPromise: Promise<void> | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(SQS_CLIENT) private readonly sqsClient: SQSClient,
    private readonly queueUrlResolver: SqsQueueUrlResolver,
  ) {}

  onApplicationBootstrap(): void {
    this.loopPromise = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.loopPromise;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error(`Falha inesperada no ciclo do outbox worker: ${String(error)}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  private async runOnce(): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(OutboxMessageEntity);
      const entities = await repository
        .createQueryBuilder("m")
        .where("m.published_at IS NULL")
        .andWhere("(m.next_attempt_at IS NULL OR m.next_attempt_at <= :now)", { now })
        .orderBy("m.occurred_at", "ASC")
        .limit(BATCH_SIZE)
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .getMany();

      if (entities.length === 0) {
        return;
      }

      const queueUrl = await this.queueUrlResolver.resolve(this.destinationQueueName);

      for (const entity of entities) {
        const message = OutboxMessageMapper.toDomain(entity);
        try {
          await this.publish(queueUrl, message);
          message.markPublished(now);
        } catch (error) {
          this.logger.warn(
            `Falha ao publicar mensagem de outbox "${message.id}" (evento ${message.eventType}): ${String(error)}`,
            { outboxMessageId: message.id, eventType: message.eventType },
          );
          message.scheduleRetry(now);
        }
        await repository.save(OutboxMessageMapper.toPersistence(message));
      }
    });
  }

  private async publish(queueUrl: string, message: OutboxMessage): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message.payload),
        MessageGroupId: message.aggregateId,
        MessageDeduplicationId: message.id,
      }),
    );
  }
}
