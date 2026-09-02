import { GetQueueUrlCommand, type SQSClient } from "@aws-sdk/client-sqs";
import { Inject, Injectable } from "@nestjs/common";

import { SQS_CLIENT } from "./sqs-client.provider.js";

@Injectable()
export class SqsQueueUrlResolver {
  private readonly cache = new Map<string, string>();

  constructor(@Inject(SQS_CLIENT) private readonly client: SQSClient) {}

  async resolve(queueName: string): Promise<string> {
    const cached = this.cache.get(queueName);
    if (cached !== undefined) {
      return cached;
    }
    const response = await this.client.send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (response.QueueUrl === undefined) {
      throw new Error(`Não foi possível resolver a URL da fila "${queueName}".`);
    }
    this.cache.set(queueName, response.QueueUrl);
    return response.QueueUrl;
  }
}
