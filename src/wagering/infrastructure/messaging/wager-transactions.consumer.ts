import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  MessageSystemAttributeName,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { isTransientTransactionError } from "../../../shared/database/postgres-error.util.js";
import { DomainHttpException } from "../../../shared/errors/domain-http-exception.js";
import { SQS_CLIENT } from "../../../shared/messaging/infrastructure/sqs-client.provider.js";
import { SqsQueueUrlResolver } from "../../../shared/messaging/infrastructure/sqs-queue-url.resolver.js";
import { buildSqsQueueNames } from "../../../shared/messaging/infrastructure/sqs.config.js";
import { SubmitWagerTransactionUseCase } from "../../application/submit-wager-transaction.use-case.js";
import { WagerTransactionRequestedMessageDto } from "../../interface/dto/wager-transaction-requested-message.dto.js";

export const WAGER_TRANSACTIONS_CONSUMER_NAME = "wagering.wager-transactions-consumer";

const WAIT_TIME_SECONDS = 20;
const TRANSIENT_BACKOFF_DELAYS_SECONDS: readonly number[] = [5, 15, 30, 60, 120];

function transientBackoffSeconds(receiveCount: number): number {
  const index = Math.min(
    Math.max(receiveCount, 1) - 1,
    TRANSIENT_BACKOFF_DELAYS_SECONDS.length - 1,
  );
  return TRANSIENT_BACKOFF_DELAYS_SECONDS[index] ?? 120;
}

@Injectable()
export class WagerTransactionsConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WagerTransactionsConsumer.name);
  private readonly queueName = buildSqsQueueNames().wagerTransactionsQueueName;
  private readonly abortController = new AbortController();
  private stopped = false;
  private loopPromise: Promise<void> | undefined;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqsClient: SQSClient,
    private readonly queueUrlResolver: SqsQueueUrlResolver,
    private readonly submitWagerTransactionUseCase: SubmitWagerTransactionUseCase,
  ) {}

  onApplicationBootstrap(): void {
    this.loopPromise = this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.abortController.abort();
    await this.loopPromise;
  }

  private async loop(): Promise<void> {
    const queueUrl = await this.queueUrlResolver.resolve(this.queueName);
    while (!this.stopped) {
      try {
        await this.pollOnce(queueUrl);
      } catch (error) {
        if (this.stopped) {
          break;
        }
        this.logger.error(`Falha inesperada no ciclo do consumer: ${String(error)}`);
      }
    }
  }

  private async pollOnce(queueUrl: string): Promise<void> {
    const response = await this.sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: WAIT_TIME_SECONDS,
        MessageSystemAttributeNames: [MessageSystemAttributeName.ApproximateReceiveCount],
      }),
      { abortSignal: this.abortController.signal },
    );
    const message = response.Messages?.[0];
    if (message === undefined) {
      return;
    }
    await this.handle(queueUrl, message);
  }

  private async handle(queueUrl: string, message: Message): Promise<void> {
    const receiptHandle = message.ReceiptHandle;
    const sqsMessageId = message.MessageId;
    if (receiptHandle === undefined || sqsMessageId === undefined) {
      this.logger.error("Mensagem SQS recebida sem ReceiptHandle/MessageId; ignorando.");
      return;
    }
    const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? "1");

    let envelope: WagerTransactionRequestedMessageDto;
    try {
      envelope = await this.parseEnvelope(message.Body);
    } catch (error) {
      this.logger.error(
        `Mensagem malformada (sqsMessageId=${sqsMessageId}, tentativa=${receiveCount}): ${String(error)}; ` +
          "deixando a fila aplicar a política de redrive.",
      );
      return;
    }

    const messageId = envelope.messageId;
    try {
      await this.submitWagerTransactionUseCase.execute({
        idempotencyKey: envelope.data.idempotencyKey,
        providerId: envelope.data.providerId,
        externalTransactionId: envelope.data.externalTransactionId,
        playerId: envelope.data.playerId,
        walletId: envelope.data.walletId,
        roundId: envelope.data.roundId,
        gameId: envelope.data.gameId,
        kind: envelope.data.kind,
        money: envelope.data.money,
        referenceExternalTransactionId: envelope.data.referenceExternalTransactionId,
        inbox: { consumerName: WAGER_TRANSACTIONS_CONSUMER_NAME, messageId },
      });
      await this.ack(queueUrl, receiptHandle);
    } catch (error) {
      await this.handleExecutionError(queueUrl, receiptHandle, messageId, receiveCount, error);
    }
  }

  private async handleExecutionError(
    queueUrl: string,
    receiptHandle: string,
    messageId: string,
    receiveCount: number,
    error: unknown,
  ): Promise<void> {
    if (error instanceof DomainHttpException) {
      this.logger.warn(
        `Rejeição de negócio ao processar messageId=${messageId}: ${error.message}; confirmando mensagem.`,
      );
      await this.ack(queueUrl, receiptHandle);
      return;
    }

    if (isTransientTransactionError(error)) {
      const delaySeconds = transientBackoffSeconds(receiveCount);
      this.logger.warn(
        `Erro transitório ao processar messageId=${messageId} (tentativa ${receiveCount}); ` +
          `reagendando visibilidade em ${delaySeconds}s.`,
      );
      await this.changeVisibility(queueUrl, receiptHandle, delaySeconds);
      return;
    }

    this.logger.error(
      `Erro ao processar messageId=${messageId} (tentativa ${receiveCount}): ${String(error)}; ` +
        "deixando a fila aplicar a política de redrive.",
    );
  }

  private async parseEnvelope(
    body: string | undefined,
  ): Promise<WagerTransactionRequestedMessageDto> {
    if (body === undefined) {
      throw new Error("Corpo da mensagem ausente.");
    }
    const parsed: unknown = JSON.parse(body);
    const instance = plainToInstance(WagerTransactionRequestedMessageDto, parsed);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      throw new Error(`Payload inválido: ${errors.map((error) => error.property).join(", ")}`);
    }
    return instance;
  }

  private async ack(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.sqsClient.send(
      new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }),
    );
  }

  private async changeVisibility(
    queueUrl: string,
    receiptHandle: string,
    delaySeconds: number,
  ): Promise<void> {
    await this.sqsClient.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: delaySeconds,
      }),
    );
  }
}
