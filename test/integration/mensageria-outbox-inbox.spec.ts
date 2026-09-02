import { randomUUID } from "node:crypto";

import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../../src/database/database.config.js";
import { OutboxPublisherWorker } from "../../src/shared/messaging/infrastructure/outbox-publisher.worker.js";
import { InboxMessageEntity } from "../../src/shared/messaging/infrastructure/persistence/inbox-message.entity.js";
import { OutboxMessageEntity } from "../../src/shared/messaging/infrastructure/persistence/outbox-message.entity.js";
import { SqsQueueUrlResolver } from "../../src/shared/messaging/infrastructure/sqs-queue-url.resolver.js";
import {
  buildSqsClientConfig,
  buildSqsQueueNames,
} from "../../src/shared/messaging/infrastructure/sqs.config.js";
import { Money } from "../../src/shared/money/money.js";
import { SubmitWagerTransactionUseCase } from "../../src/wagering/application/submit-wager-transaction.use-case.js";
import { WagerTransactionStatus } from "../../src/wagering/domain/wager-transaction-status.enum.js";
import { WagerTransactionEntity } from "../../src/wagering/infrastructure/persistence/wager-transaction.entity.js";
import { Wallet } from "../../src/wallets/domain/wallet.js";
import { WalletLedgerEntryEntity } from "../../src/wallets/infrastructure/persistence/wallet-ledger-entry.entity.js";
import { WalletEntity } from "../../src/wallets/infrastructure/persistence/wallet.entity.js";
import { WalletMapper } from "../../src/wallets/infrastructure/persistence/wallet.mapper.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Mensageria, outbox e inbox com Postgres e LocalStack SQS reais (etapa 6 — Definition of Done)", () => {
  let dataSource: DataSource;
  let useCase: SubmitWagerTransactionUseCase;
  let sqsClient: SQSClient;

  beforeAll(async () => {
    dataSource = new DataSource(buildTypeOrmOptions());
    await dataSource.initialize();
    useCase = new SubmitWagerTransactionUseCase(dataSource);
    sqsClient = new SQSClient(buildSqsClientConfig());
  });

  afterAll(async () => {
    sqsClient.destroy();
    await dataSource.destroy();
  });

  async function seedWallet(initialAmount: string, currency = "BRL"): Promise<string> {
    const wallet = Wallet.open({
      id: randomUUID(),
      playerId: randomUUID(),
      initialBalance: Money.from({ amount: initialAmount, currency }),
      now: new Date(),
    });
    await dataSource.getRepository(WalletEntity).insert(WalletMapper.toPersistence(wallet));
    return wallet.id;
  }

  it("mesma messageId de inbox processada duas vezes em paralelo não duplica o efeito financeiro", async () => {
    const walletId = await seedWallet("100.00");
    const messageId = randomUUID();
    const idempotencyKey = `provider-a:${randomUUID()}`;
    const externalTransactionId = randomUUID();
    const playerId = randomUUID();

    const buildCommand = () => ({
      idempotencyKey,
      providerId: "provider-a",
      externalTransactionId,
      playerId,
      walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: "BET" as const,
      money: { amount: "15.00", currency: "BRL" },
      referenceExternalTransactionId: undefined,
      inbox: { consumerName: "test-consumer", messageId },
    });

    const results = await Promise.all([
      useCase.execute(buildCommand()),
      useCase.execute(buildCommand()),
    ]);

    const nonReplays = results.filter((r) => !r.idempotentReplay);
    const replays = results.filter((r) => r.idempotentReplay);
    expect(nonReplays).toHaveLength(1);
    expect(replays).toHaveLength(1);
    expect(nonReplays[0]?.transaction.id).toBe(replays[0]?.transaction.id);

    const walletEntity = await dataSource
      .getRepository(WalletEntity)
      .findOneByOrFail({ id: walletId });
    expect(walletEntity.balanceAmount).toBe("85.00");

    const ledgerEntries = await dataSource
      .getRepository(WalletLedgerEntryEntity)
      .find({ where: { walletId } });
    expect(ledgerEntries).toHaveLength(1);

    const inboxRows = await dataSource
      .getRepository(InboxMessageEntity)
      .find({ where: { consumerName: "test-consumer", messageId } });
    expect(inboxRows).toHaveLength(1);
  });

  it(
    "REFUND entregue antes da BET referenciada fica PENDING_REFERENCE e é resolvida automaticamente " +
      "quando a BET chega (retryDueReferences)",
    async () => {
      const walletId = await seedWallet("100.00");
      const playerId = randomUUID();
      const betExternalId = randomUUID();

      const refundResult = await useCase.execute({
        idempotencyKey: `provider-a:${randomUUID()}`,
        providerId: "provider-a",
        externalTransactionId: randomUUID(),
        playerId,
        walletId,
        roundId: "round-1",
        gameId: "game-1",
        kind: "REFUND",
        money: { amount: "20.00", currency: "BRL" },
        referenceExternalTransactionId: betExternalId,
      });
      expect(refundResult.transaction.status).toBe(WagerTransactionStatus.PendingReference);

      const betResult = await useCase.execute({
        idempotencyKey: `provider-a:${betExternalId}`,
        providerId: "provider-a",
        externalTransactionId: betExternalId,
        playerId,
        walletId,
        roundId: "round-1",
        gameId: "game-1",
        kind: "BET",
        money: { amount: "20.00", currency: "BRL" },
        referenceExternalTransactionId: undefined,
      });
      expect(betResult.transaction.status).toBe(WagerTransactionStatus.Processed);

      const walletAfterBet = await dataSource
        .getRepository(WalletEntity)
        .findOneByOrFail({ id: walletId });
      expect(walletAfterBet.balanceAmount).toBe("80.00");

      const afterFirstRecheckDelay = new Date(Date.now() + 2 * 60_000);
      const advanced = await useCase.retryDueReferences(afterFirstRecheckDelay, 20);
      expect(advanced).toBeGreaterThanOrEqual(1);

      const refundEntity = await dataSource
        .getRepository(WagerTransactionEntity)
        .findOneByOrFail({ id: refundResult.transaction.id });
      expect(refundEntity.status).toBe(WagerTransactionStatus.Processed);
      expect(refundEntity.referenceTransactionId).toBe(betResult.transaction.id);

      const walletFinal = await dataSource
        .getRepository(WalletEntity)
        .findOneByOrFail({ id: walletId });
      expect(walletFinal.balanceAmount).toBe("100.00");

      const ledgerEntries = await dataSource
        .getRepository(WalletLedgerEntryEntity)
        .find({ where: { walletId } });
      expect(ledgerEntries).toHaveLength(2);
    },
  );

  it(
    "duas instâncias do outbox worker rodando ao mesmo tempo publicam cada mensagem exatamente uma vez " +
      "na fila real do LocalStack",
    async () => {
      const walletIds = await Promise.all(Array.from({ length: 6 }, () => seedWallet("100.00")));

      await Promise.all(
        walletIds.map((walletId) =>
          useCase.execute({
            idempotencyKey: `provider-a:${randomUUID()}`,
            providerId: "provider-a",
            externalTransactionId: randomUUID(),
            playerId: randomUUID(),
            walletId,
            roundId: "round-1",
            gameId: "game-1",
            kind: "BET",
            money: { amount: "10.00", currency: "BRL" },
            referenceExternalTransactionId: undefined,
          }),
        ),
      );

      const pendingBefore = await dataSource
        .getRepository(OutboxMessageEntity)
        .find({ where: walletIds.map((aggregateId) => ({ aggregateId })) });
      expect(pendingBefore.length).toBeGreaterThanOrEqual(walletIds.length * 2);
      const expectedEventIds = new Set(pendingBefore.map((message) => message.id));

      const queueUrlResolver = new SqsQueueUrlResolver(sqsClient);
      const worker1 = new OutboxPublisherWorker(dataSource, sqsClient, queueUrlResolver);
      const worker2 = new OutboxPublisherWorker(dataSource, sqsClient, queueUrlResolver);

      worker1.onApplicationBootstrap();
      worker2.onApplicationBootstrap();
      await sleep(5_000);
      await Promise.all([worker1.onModuleDestroy(), worker2.onModuleDestroy()]);

      const outboxRows = await dataSource
        .getRepository(OutboxMessageEntity)
        .find({ where: walletIds.map((aggregateId) => ({ aggregateId })) });
      expect(outboxRows).toHaveLength(pendingBefore.length);
      for (const row of outboxRows) {
        expect(row.publishedAt).not.toBeNull();
      }

      const queueUrl = await queueUrlResolver.resolve(
        buildSqsQueueNames().wagerTransactionEventsQueueName,
      );
      const receivedEventIds = new Set<string>();
      const duplicateDeliveries: string[] = [];
      for (let i = 0; i < 20 && receivedEventIds.size < expectedEventIds.size; i += 1) {
        const response = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 2,
          }),
        );
        const messages = response.Messages ?? [];
        if (messages.length === 0) {
          continue;
        }
        for (const message of messages) {
          if (message.Body === undefined) {
            continue;
          }
          const body = JSON.parse(message.Body) as { eventId: string; aggregateId: string };
          if (!expectedEventIds.has(body.eventId)) {
            continue;
          }
          if (receivedEventIds.has(body.eventId)) {
            duplicateDeliveries.push(body.eventId);
          } else {
            receivedEventIds.add(body.eventId);
          }
          if (message.ReceiptHandle !== undefined) {
            await sqsClient.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: message.ReceiptHandle,
              }),
            );
          }
        }
      }

      expect(duplicateDeliveries).toHaveLength(0);
      expect(receivedEventIds.size).toBe(expectedEventIds.size);
    },
    40_000,
  );
});
