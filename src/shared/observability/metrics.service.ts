import { Injectable } from "@nestjs/common";
import { Counter, Gauge, Histogram, Registry } from "prom-client";

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly transactionsTotal = new Counter({
    name: "wagering_transactions_total",
    help: "Transações processadas pelo SubmitWagerTransactionUseCase, por status e kind.",
    labelNames: ["status", "kind"],
    registers: [this.registry],
  });

  private readonly duplicatesTotal = new Counter({
    name: "wagering_duplicates_total",
    help: "Duplicatas detectadas (replay de idempotência ou de inbox), por kind.",
    labelNames: ["kind"],
    registers: [this.registry],
  });

  private readonly retriesTotal = new Counter({
    name: "wagering_retries_total",
    help: "Tentativas de reprocessamento por erro transitório, por origem.",
    labelNames: ["reason"],
    registers: [this.registry],
  });

  private readonly lockConflictsTotal = new Counter({
    name: "wagering_lock_conflicts_total",
    help: "Conflitos de lock/serialização reportados pelo Postgres (deadlock ou serialization failure).",
    registers: [this.registry],
  });

  private readonly reconciliationDivergencesTotal = new Counter({
    name: "wagering_reconciliation_divergences_total",
    help: "Divergências detectadas entre saldo armazenado e saldo reconstruído pelo ledger.",
    registers: [this.registry],
  });

  readonly transactionDuration = new Histogram({
    name: "wagering_transaction_duration_seconds",
    help: "Latência de processamento do SubmitWagerTransactionUseCase.",
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly outboxLagSeconds = new Gauge({
    name: "wagering_outbox_lag_seconds",
    help: "Idade da mensagem de outbox pendente mais antiga já elegível para publicação.",
    registers: [this.registry],
  });

  readonly dlqMessages = new Gauge({
    name: "wagering_dlq_messages",
    help: "Quantidade aproximada de mensagens nas filas de dead-letter.",
    labelNames: ["queue"],
    registers: [this.registry],
  });

  recordTransactionOutcome(status: string, kind: string): void {
    this.transactionsTotal.labels(status, kind).inc();
  }

  recordDuplicate(kind: string): void {
    this.duplicatesTotal.labels(kind).inc();
  }

  recordRetry(reason: string): void {
    this.retriesTotal.labels(reason).inc();
  }

  recordLockConflict(): void {
    this.lockConflictsTotal.inc();
  }

  recordReconciliationDivergence(): void {
    this.reconciliationDivergencesTotal.inc();
  }
}
