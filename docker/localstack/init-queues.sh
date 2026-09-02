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

EVENTS_QUEUE_NAME="wager-transaction-events.fifo"
EVENTS_DLQ_NAME="wager-transaction-events-dlq.fifo"

echo "[init-queues] criando ${EVENTS_DLQ_NAME}..."
EVENTS_DLQ_URL=$(awslocal sqs create-queue --region "${REGION}" --queue-name "${EVENTS_DLQ_NAME}" --attributes FifoQueue=true,ContentBasedDeduplication=true --query 'QueueUrl' --output text)
EVENTS_DLQ_ARN=$(awslocal sqs get-queue-attributes --region "${REGION}" --queue-url "${EVENTS_DLQ_URL}" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

echo "[init-queues] criando ${EVENTS_QUEUE_NAME} (redrive para ${EVENTS_DLQ_NAME} após 5 tentativas)..."
awslocal sqs create-queue --region "${REGION}" --queue-name "${EVENTS_QUEUE_NAME}" --attributes "{\"FifoQueue\": \"true\", \"ContentBasedDeduplication\": \"true\", \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${EVENTS_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\" }" >/dev/null

echo "[init-queues] filas prontas:"
awslocal sqs list-queues --region "${REGION}"
