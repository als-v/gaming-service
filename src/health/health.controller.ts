import { GetQueueAttributesCommand, type SQSClient } from "@aws-sdk/client-sqs";
import { Controller, Get, HttpCode, HttpStatus, Inject, ServiceUnavailableException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { SQS_CLIENT } from "../shared/messaging/infrastructure/sqs-client.provider.js";
import { SqsQueueUrlResolver } from "../shared/messaging/infrastructure/sqs-queue-url.resolver.js";
import { buildSqsQueueNames } from "../shared/messaging/infrastructure/sqs.config.js";
import { WalletEntity } from "../wallets/infrastructure/persistence/wallet.entity.js";

interface HealthResponse {
  status: "ok";
}

@Controller("health")
export class HealthController {
  private readonly queueName = buildSqsQueueNames().wagerTransactionsQueueName;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(SQS_CLIENT) private readonly sqsClient: SQSClient,
    private readonly queueUrlResolver: SqsQueueUrlResolver,
  ) {}

  @Get("live")
  @HttpCode(HttpStatus.OK)
  live(): HealthResponse {
    return { status: "ok" };
  }

  @Get("ready")
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<HealthResponse> {
    await this.checkPostgres();
    await this.checkSqs();
    return { status: "ok" };
  }

  private async checkPostgres(): Promise<void> {
    try {
      await this.dataSource
        .createQueryBuilder(WalletEntity, "w")
        .select("1", "ok")
        .limit(1)
        .getRawOne();
    } catch (error) {
      throw new ServiceUnavailableException(`Postgres indisponível: ${String(error)}`);
    }
  }

  private async checkSqs(): Promise<void> {
    try {
      const queueUrl = await this.queueUrlResolver.resolve(this.queueName);
      await this.sqsClient.send(
        new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ["QueueArn"] }),
      );
    } catch (error) {
      throw new ServiceUnavailableException(`SQS indisponível: ${String(error)}`);
    }
  }
}
