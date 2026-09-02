import { Module } from "@nestjs/common";

import { OutboxPublisherWorker } from "./infrastructure/outbox-publisher.worker.js";
import { sqsClientProvider, SQS_CLIENT } from "./infrastructure/sqs-client.provider.js";
import { SqsQueueUrlResolver } from "./infrastructure/sqs-queue-url.resolver.js";

@Module({
  providers: [sqsClientProvider, SqsQueueUrlResolver, OutboxPublisherWorker],
  exports: [SQS_CLIENT, SqsQueueUrlResolver],
})
export class MessagingModule {}
