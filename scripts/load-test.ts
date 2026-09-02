import { randomUUID } from "node:crypto";

interface WalletState {
  id: string;
  recentBetExternalIds: string[];
}

interface RequestOutcome {
  kind: "BET" | "WIN" | "REFUND";
  status: number;
  durationMs: number;
  errorCategory?: "insufficient_balance" | "pending_reference" | "http_error" | "network_error";
}

const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? "http://localhost:3000";
const WALLET_COUNT = Number(process.env.LOAD_TEST_WALLETS ?? "20");
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY ?? "20");
const DURATION_SECONDS = Number(process.env.LOAD_TEST_DURATION_SECONDS ?? "20");
const INITIAL_BALANCE = process.env.LOAD_TEST_INITIAL_BALANCE ?? "1000000.00";
const CURRENCY = "BRL";
const KIND_WEIGHTS: ReadonlyArray<{ kind: RequestOutcome["kind"]; weight: number }> = [
  { kind: "BET", weight: 6 },
  { kind: "WIN", weight: 2 },
  { kind: "REFUND", weight: 2 },
];

function pickKind(): RequestOutcome["kind"] {
  const totalWeight = KIND_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of KIND_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.kind;
    }
  }
  return "BET";
}

function pickAmount(): string {
  const cents = 100 + Math.floor(Math.random() * 4900);
  return (cents / 100).toFixed(2);
}

async function createWallet(): Promise<WalletState> {
  const response = await fetch(`${BASE_URL}/wallets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: randomUUID(),
      initialBalance: { amount: INITIAL_BALANCE, currency: CURRENCY },
    }),
  });
  if (!response.ok) {
    throw new Error(`Falha ao criar wallet de carga: HTTP ${String(response.status)}`);
  }
  const body = (await response.json()) as { id: string };
  return { id: body.id, recentBetExternalIds: [] };
}

async function submit(
  wallet: WalletState,
  kind: RequestOutcome["kind"],
  providerId: string,
): Promise<RequestOutcome> {
  const externalTransactionId = randomUUID();
  const referenceExternalTransactionId =
    kind === "REFUND"
      ? (wallet.recentBetExternalIds[wallet.recentBetExternalIds.length - 1] ?? randomUUID())
      : undefined;

  const startedAt = performance.now();
  try {
    const response = await fetch(`${BASE_URL}/wagering/transactions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `${providerId}:${externalTransactionId}`,
      },
      body: JSON.stringify({
        providerId,
        externalTransactionId,
        playerId: randomUUID(),
        walletId: wallet.id,
        roundId: `round-${randomUUID()}`,
        gameId: "load-test-game",
        kind,
        money: { amount: pickAmount(), currency: CURRENCY },
        referenceExternalTransactionId,
      }),
    });
    const durationMs = performance.now() - startedAt;
    const body = (await response.json().catch(() => ({}))) as { status?: string };

    if (kind === "BET" && response.status === 200) {
      wallet.recentBetExternalIds.push(externalTransactionId);
      if (wallet.recentBetExternalIds.length > 20) {
        wallet.recentBetExternalIds.shift();
      }
    }

    if (response.ok) {
      return { kind, status: response.status, durationMs };
    }
    const errorCategory =
      body.status === "REJECTED"
        ? "insufficient_balance"
        : body.status === "PENDING_REFERENCE"
          ? "pending_reference"
          : "http_error";
    return { kind, status: response.status, durationMs, errorCategory };
  } catch {
    return { kind, status: 0, durationMs: performance.now() - startedAt, errorCategory: "network_error" };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? 0;
}

function metricValue(metricsText: string, metricName: string): number {
  return metricsText
    .split("\n")
    .filter((line) => line.startsWith(metricName))
    .reduce((sum, line) => {
      const value = Number(line.trim().split(/\s+/).pop());
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
}

interface MetricsSnapshot {
  lockConflicts: number;
  retries: number;
  reconciliationDivergences: number;
  outboxLagSeconds: number;
}

async function readMetricsSnapshot(): Promise<MetricsSnapshot> {
  const response = await fetch(`${BASE_URL}/metrics`);
  const text = await response.text();
  return {
    lockConflicts: metricValue(text, "wagering_lock_conflicts_total"),
    retries: metricValue(text, "wagering_retries_total"),
    reconciliationDivergences: metricValue(text, "wagering_reconciliation_divergences_total"),
    outboxLagSeconds: metricValue(text, "wagering_outbox_lag_seconds"),
  };
}

async function runWorker(
  wallets: WalletState[],
  providerId: string,
  deadline: number,
  outcomes: RequestOutcome[],
): Promise<void> {
  while (Date.now() < deadline) {
    const wallet = wallets[Math.floor(Math.random() * wallets.length)];
    if (wallet === undefined) {
      return;
    }
    const outcome = await submit(wallet, pickKind(), providerId);
    outcomes.push(outcome);
  }
}

async function main(): Promise<void> {
  console.log(
    `Teste de carga: ${String(WALLET_COUNT)} wallets, ${String(CONCURRENCY)} providers concorrentes, ` +
      `${String(DURATION_SECONDS)}s contra ${BASE_URL}.`,
  );

  const wallets = await Promise.all(Array.from({ length: WALLET_COUNT }, () => createWallet()));
  const metricsBefore = await readMetricsSnapshot().catch(() => undefined);

  const outcomes: RequestOutcome[] = [];
  const deadline = Date.now() + DURATION_SECONDS * 1000;
  const startedAt = Date.now();

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, index) =>
      runWorker(wallets, `load-provider-${String(index)}`, deadline, outcomes),
    ),
  );

  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const metricsAfter = await readMetricsSnapshot().catch(() => undefined);

  const durations = outcomes.map((outcome) => outcome.durationMs).sort((a, b) => a - b);
  const successes = outcomes.filter((outcome) => outcome.status >= 200 && outcome.status < 300);
  const byErrorCategory = new Map<string, number>();
  for (const outcome of outcomes) {
    if (outcome.errorCategory !== undefined) {
      byErrorCategory.set(outcome.errorCategory, (byErrorCategory.get(outcome.errorCategory) ?? 0) + 1);
    }
  }
  const byKind = new Map<string, number>();
  for (const outcome of outcomes) {
    byKind.set(outcome.kind, (byKind.get(outcome.kind) ?? 0) + 1);
  }

  console.log("\n=== Resultado ===");
  console.log(`Requisições totais: ${String(outcomes.length)}`);
  console.log(`Duração real: ${elapsedSeconds.toFixed(1)}s`);
  console.log(`Throughput: ${(outcomes.length / elapsedSeconds).toFixed(1)} req/s`);
  console.log(`Sucesso (2xx): ${String(successes.length)} (${((successes.length / outcomes.length) * 100).toFixed(1)}%)`);
  console.log("Por kind:", Object.fromEntries(byKind));
  console.log("Por categoria de erro:", Object.fromEntries(byErrorCategory));
  console.log(
    `Latência (ms) — p50: ${percentile(durations, 50).toFixed(1)}, ` +
      `p95: ${percentile(durations, 95).toFixed(1)}, p99: ${percentile(durations, 99).toFixed(1)}`,
  );
  if (metricsBefore !== undefined && metricsAfter !== undefined) {
    console.log("\n=== Métricas (/metrics) ===");
    console.log(`Conflitos de lock: ${String(metricsAfter.lockConflicts - metricsBefore.lockConflicts)}`);
    console.log(`Retries: ${String(metricsAfter.retries - metricsBefore.retries)}`);
    console.log(
      `Divergências de reconciliação: ${String(metricsAfter.reconciliationDivergences - metricsBefore.reconciliationDivergences)}`,
    );
    console.log(`Outbox lag ao final: ${metricsAfter.outboxLagSeconds.toFixed(2)}s`);
  }
}

await main();
