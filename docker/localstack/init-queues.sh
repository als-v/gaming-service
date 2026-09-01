#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
QUEUE_NAME="wager-transactions.fifo"
DLQ_NAME="wager-transactions-dlq.fifo"

echo "[init-queues] criando ${DLQ_NAME}..."
DLQ_URL=$(awslocal sqs create-queue --region "${REGION}" --queue-name "${DLQ_NAME}" --attributes FifoQueue=true,ContentBasedDeduplication=true --query 'QueueUrl' --output text)
DLQ_ARN=$(awslocal sqs get-queue-attributes --region "${REGION}" --queue-url "${DLQ_URL}" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

echo "[init-queues] criando ${QUEUE_NAME} (redrive para ${DLQ_NAME} após 5 tentativas)..."
awslocal sqs create-queue --region "${REGION}" --queue-name "${QUEUE_NAME}" --attributes "{\"FifoQueue\": \"true\", \"ContentBasedDeduplication\": \"true\", \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\" }" >/dev/null

echo "[init-queues] filas prontas:"
awslocal sqs list-queues --region "${REGION}"
