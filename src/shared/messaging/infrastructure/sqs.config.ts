import type { SQSClientConfig } from "@aws-sdk/client-sqs";

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value;
}

export function buildSqsClientConfig(env: NodeJS.ProcessEnv = process.env): SQSClientConfig {
  return {
    region: requireEnv(env, "AWS_REGION"),
    endpoint: requireEnv(env, "AWS_ENDPOINT_URL"),
    credentials: {
      accessKeyId: requireEnv(env, "AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv(env, "AWS_SECRET_ACCESS_KEY"),
    },
  };
}

export interface SqsQueueNames {
  wagerTransactionsQueueName: string;
  wagerTransactionsDlqQueueName: string;
  wagerTransactionEventsQueueName: string;
  wagerTransactionEventsDlqQueueName: string;
}

export function buildSqsQueueNames(env: NodeJS.ProcessEnv = process.env): SqsQueueNames {
  return {
    wagerTransactionsQueueName: requireEnv(env, "SQS_WAGER_TRANSACTIONS_QUEUE_NAME"),
    wagerTransactionsDlqQueueName: requireEnv(env, "SQS_WAGER_TRANSACTIONS_DLQ_QUEUE_NAME"),
    wagerTransactionEventsQueueName: requireEnv(env, "SQS_WAGER_TRANSACTION_EVENTS_QUEUE_NAME"),
    wagerTransactionEventsDlqQueueName: requireEnv(
      env,
      "SQS_WAGER_TRANSACTION_EVENTS_DLQ_QUEUE_NAME",
    ),
  };
}
