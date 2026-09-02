import { randomUUID } from "node:crypto";

import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  QueueAttributeName,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../../src/database/database.config.js";
import { buildSqsClientConfig, buildSqsQueueNames } from "../../src/shared/messaging/infrastructure/sqs.config.js";
import { WagerTransactionKind } from "../../src/wagering/domain/wager-transaction-kind.enum.js";
import { WagerTransactionStatus } from "../../src/wagering/domain/wager-transaction-status.enum.js";
import { WagerTransactionEntity } from "../../src/wagering/infrastructure/persistence/wager-transaction.entity.js";
import { WalletLedgerEntryEntity } from "../../src/wallets/infrastructure/persistence/wallet-ledger-entry.entity.js";
import { WalletEntity } from "../../src/wallets/infrastructure/persistence/wallet.entity.js";
import { spawnApp, type SpawnedApp } from "./helpers/spawn-app.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BASE_PORT = 3301;

interface ReconciliationBody {
  walletId: string;
  storedBalance: { amount: string; currency: string };
  calculatedBalance: { amount: string; currency: string };
  consistent: boolean;
  checkedEntries: number;
}

async function createWallet(port: number, initialBalance: string): Promise<string> {
  const response = await fetch(`http://localhost:${port}/wallets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: randomUUID(),
      initialBalance: { amount: initialBalance, currency: "BRL" },
    }),
  });
  const body = (await response.json()) as { id: string };
  return body.id;
}

interface SubmitOverrides {
  walletId: string;
  kind: string;
  amount: string;
  idempotencyKey?: string;
  externalTransactionId?: string;
  playerId?: string;
  referenceExternalTransactionId?: string;
}

async function submitTransaction(
  port: number,
  overrides: SubmitOverrides,
): Promise<{ status: number; body: { status?: string; transactionId?: string } }> {
  const idempotencyKey = overrides.idempotencyKey ?? `provider-a:${randomUUID()}`;
  const response = await fetch(`http://localhost:${port}/wagering/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({
      providerId: "provider-a",
      externalTransactionId: overrides.externalTransactionId ?? randomUUID(),
      playerId: overrides.playerId ?? randomUUID(),
      walletId: overrides.walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: overrides.kind,
      money: { amount: overrides.amount, currency: "BRL" },
      referenceExternalTransactionId: overrides.referenceExternalTransactionId,
    }),
  });
  const body = (await response.json()) as { status?: string; transactionId?: string };
  return { status: response.status, body };
}

async function reconcile(port: number, walletId: string): Promise<ReconciliationBody> {
  const response = await fetch(`http://localhost:${port}/wallets/${walletId}/reconciliation`, {
    method: "POST",
  });
  return (await response.json()) as ReconciliationBody;
}

async function drainVisibleMessages(sqsClient: SQSClient, queueUrl: string): Promise<void> {
  for (;;) {
    const response = await sqsClient.send(
      new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 0 }),
    );
    const messages = response.Messages ?? [];
    if (messages.length === 0) {
      return;
    }
    await Promise.all(
      messages
        .filter((message) => message.ReceiptHandle !== undefined)
        .map((message) =>
          sqsClient.send(
            new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }),
          ),
        ),
    );
  }
}

async function waitForEmptyQueue(
  sqsClient: SQSClient,
  queueUrl: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await drainVisibleMessages(sqsClient, queueUrl);
    const attributes = await sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          QueueAttributeName.ApproximateNumberOfMessages,
          QueueAttributeName.ApproximateNumberOfMessagesNotVisible,
        ],
      }),
    );
    const visible = Number(attributes.Attributes?.ApproximateNumberOfMessages ?? "0");
    const inFlight = Number(attributes.Attributes?.ApproximateNumberOfMessagesNotVisible ?? "0");
    if (visible === 0 && inFlight === 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Fila "${queueUrl}" ainda com mensagens residuais (visíveis=${visible}, em voo=${inFlight}) ` +
          "após o timeout de drenagem.",
      );
    }
    await sleep(1_000);
  }
}

describe("Concorrência real entre processos (REQUISITOS §13, cenários 4, 5 e 8)", () => {
  const apps: SpawnedApp[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.stop("SIGKILL")));
  });

  afterAll(async () => {
    const sqsClient = new SQSClient(buildSqsClientConfig());
    try {
      const queueNames = buildSqsQueueNames();
      for (const queueName of [
        queueNames.wagerTransactionsQueueName,
        queueNames.wagerTransactionEventsQueueName,
      ]) {
        const { QueueUrl } = await sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
        if (QueueUrl !== undefined) {
          await drainVisibleMessages(sqsClient, QueueUrl);
        }
      }
    } finally {
      sqsClient.destroy();
    }
  });

  it(
    "≥3 instâncias reais processando apostas concorrentes na mesma wallet respeitam o saldo (cenário 4)",
    async () => {
      const [a, b, c] = await Promise.all([
        spawnApp({ port: BASE_PORT }),
        spawnApp({ port: BASE_PORT + 1 }),
        spawnApp({ port: BASE_PORT + 2 }),
      ]);
      apps.push(a, b, c);

      const walletId = await createWallet(a.port, "100.00");

      const results = await Promise.all([
        submitTransaction(a.port, { walletId, kind: "BET", amount: "40.00" }),
        submitTransaction(b.port, { walletId, kind: "BET", amount: "40.00" }),
        submitTransaction(c.port, { walletId, kind: "BET", amount: "40.00" }),
      ]);

      const succeeded = results.filter((r) => r.status === 200);
      const rejected = results.filter((r) => r.status !== 200);
      expect(succeeded).toHaveLength(2);
      expect(rejected).toHaveLength(1);

      const reconciliation = await reconcile(a.port, walletId);
      expect(reconciliation.consistent).toBe(true);
      expect(reconciliation.storedBalance).toEqual({ amount: "20.00", currency: "BRL" });
      expect(reconciliation.checkedEntries).toBe(3);
    },
    30_000,
  );

  it(
    "worker morto (crash injetado) depois do commit e antes do ack é recuperado por uma nova instância via redelivery (cenário 5)",
    async () => {
      const sqsClient = new SQSClient(buildSqsClientConfig());
      const queueName = buildSqsQueueNames().wagerTransactionsQueueName;
      const queueUrlResponse = await sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
      const queueUrl = queueUrlResponse.QueueUrl;
      if (queueUrl === undefined) {
        throw new Error(`Não foi possível resolver a URL da fila "${queueName}".`);
      }

      await waitForEmptyQueue(sqsClient, queueUrl, 65_000);

      const crashingApp = await spawnApp({
        port: BASE_PORT + 10,
        env: { WAGER_CONSUMER_CRASH_AFTER_COMMIT: "1" },
      });
      apps.push(crashingApp);

      const walletId = await createWallet(crashingApp.port, "100.00");
      const messageId = randomUUID();
      const externalTransactionId = randomUUID();
      const playerId = randomUUID();

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageGroupId: walletId,
          MessageBody: JSON.stringify({
            messageId,
            type: "WagerTransactionRequested",
            occurredAt: new Date().toISOString(),
            data: {
              idempotencyKey: `provider-a:${externalTransactionId}`,
              providerId: "provider-a",
              externalTransactionId,
              playerId,
              walletId,
              roundId: "round-1",
              gameId: "game-1",
              kind: "BET",
              money: { amount: "25.00", currency: "BRL" },
            },
          }),
        }),
      );

      const exitCode = await crashingApp.waitForExit();
      expect(exitCode).toBe(1);

      const dataSource = new DataSource(buildTypeOrmOptions());
      await dataSource.initialize();
      try {
        const transactionAfterCrash = await dataSource
          .getRepository(WagerTransactionEntity)
          .findOneByOrFail({ providerId: "provider-a", externalTransactionId });
        expect(transactionAfterCrash.status).toBe(WagerTransactionStatus.Processed);

        const walletAfterCrash = await dataSource
          .getRepository(WalletEntity)
          .findOneByOrFail({ id: walletId });
        expect(walletAfterCrash.balanceAmount).toBe("75.00");
      } finally {
        await dataSource.destroy();
      }

      sqsClient.destroy();

      const recoveredApp = await spawnApp({ port: BASE_PORT + 11 });
      apps.push(recoveredApp);

      const deadline = Date.now() + 60_000;
      let reconciliation: ReconciliationBody | undefined;
      while (Date.now() < deadline) {
        reconciliation = await reconcile(recoveredApp.port, walletId);
        if (reconciliation.consistent && reconciliation.checkedEntries >= 1) {
          break;
        }
        await sleep(1_000);
      }

      expect(reconciliation?.consistent).toBe(true);
      expect(reconciliation?.storedBalance).toEqual({ amount: "75.00", currency: "BRL" });
      expect(reconciliation?.checkedEntries).toBe(2);
    },
    150_000,
  );

  it(
    "reinício abrupto do serviço (SIGKILL) em meio a apostas concorrentes preserva wallet.balance == ledger reconstruído (cenário 8)",
    async () => {
      const appA = await spawnApp({ port: BASE_PORT + 20 });
      apps.push(appA);

      const walletId = await createWallet(appA.port, "200.00");

      const submissions = Array.from({ length: 10 }, () =>
        submitTransaction(appA.port, { walletId, kind: "BET", amount: "15.00" }).catch(
          (error: unknown) => ({ status: 0, body: {}, error }),
        ),
      );

      await sleep(50);
      await appA.stop("SIGKILL");

      await Promise.allSettled(submissions);

      const appB = await spawnApp({ port: BASE_PORT + 21 });
      apps.push(appB);

      const dataSource = new DataSource(buildTypeOrmOptions());
      await dataSource.initialize();
      let committedBetCount: number;
      let ledgerEntryCount: number;
      try {
        committedBetCount = await dataSource.getRepository(WagerTransactionEntity).count({
          where: { walletId, status: WagerTransactionStatus.Processed, kind: WagerTransactionKind.Bet },
        });
        ledgerEntryCount = await dataSource
          .getRepository(WalletLedgerEntryEntity)
          .count({ where: { walletId } });
      } finally {
        await dataSource.destroy();
      }

      const expectedBalance = (200 - committedBetCount * 15).toFixed(2);
      const expectedLedgerEntries = committedBetCount + 1;

      const reconciliation = await reconcile(appB.port, walletId);
      expect(reconciliation.consistent).toBe(true);
      expect(reconciliation.storedBalance).toEqual({ amount: expectedBalance, currency: "BRL" });
      expect(reconciliation.checkedEntries).toBe(expectedLedgerEntries);
      expect(ledgerEntryCount).toBe(expectedLedgerEntries);
    },
    45_000,
  );
});
