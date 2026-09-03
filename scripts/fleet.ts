import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { spawnApp, type SpawnedApp } from "../test/integration/helpers/spawn-app.js";

const execFileAsync = promisify(execFile);

const FLEET_SIZE = Number(process.env.FLEET_SIZE ?? "5");
const FLEET_BASE_PORT = Number(process.env.FLEET_BASE_PORT ?? "3100");
const BET_AMOUNT = "10.00";
const CURRENCY = "BRL";

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

interface WalletResponse {
  id: string;
  playerId: string;
  balance: { amount: string; currency: string };
  version: number;
}

interface SubmitWagerTransactionResponse {
  transactionId: string;
  status: string;
  balance: { amount: string; currency: string } | undefined;
  idempotentReplay: boolean;
}

interface ReconciliationResponse {
  walletId: string;
  storedBalance: { amount: string; currency: string };
  calculatedBalance: { amount: string; currency: string };
  difference: { amount: string; currency: string };
  consistent: boolean;
  checkedEntries: number;
}

async function containerHealth(containerName: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "--format",
      "{{.State.Health.Status}}",
      containerName,
    ]);
    return stdout.trim();
  } catch {
    return "não encontrado";
  }
}

async function preflight(): Promise<void> {
  const [postgres, localstack] = await Promise.all([
    containerHealth("gaming-service-postgres"),
    containerHealth("gaming-service-localstack"),
  ]);
  if (postgres !== "healthy" || localstack !== "healthy") {
    throw new Error(
      `Ambiente não está pronto (postgres=${postgres}, localstack=${localstack}). ` +
        'Rode "bun run bootstrap" primeiro.',
    );
  }
}

function baseUrl(app: SpawnedApp): string {
  return `http://localhost:${String(app.port)}`;
}

async function createWallet(
  app: SpawnedApp,
  playerId: string,
  initialBalance: string,
): Promise<WalletResponse> {
  const response = await fetch(`${baseUrl(app)}/wallets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId,
      initialBalance: { amount: initialBalance, currency: CURRENCY },
    }),
  });
  if (!response.ok) {
    throw new Error(`POST /wallets falhou: HTTP ${String(response.status)}`);
  }
  return (await response.json()) as WalletResponse;
}

async function submitWager(
  app: SpawnedApp,
  idempotencyKey: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: SubmitWagerTransactionResponse }> {
  const response = await fetch(`${baseUrl(app)}/wagering/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as SubmitWagerTransactionResponse,
  };
}

async function reconcile(app: SpawnedApp, walletId: string): Promise<ReconciliationResponse> {
  const response = await fetch(`${baseUrl(app)}/wallets/${walletId}/reconciliation`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      `POST /wallets/${walletId}/reconciliation falhou: HTTP ${String(response.status)}`,
    );
  }
  return (await response.json()) as ReconciliationResponse;
}

async function getWallet(app: SpawnedApp, walletId: string): Promise<WalletResponse> {
  const response = await fetch(`${baseUrl(app)}/wallets/${walletId}`);
  if (!response.ok) {
    throw new Error(`GET /wallets/${walletId} falhou: HTTP ${String(response.status)}`);
  }
  return (await response.json()) as WalletResponse;
}

async function checkWalletCreation(
  apps: SpawnedApp[],
): Promise<{ result: CheckResult; wallet: WalletResponse }> {
  const playerId = randomUUID();
  const wallet = await createWallet(apps[0]!, playerId, "1000.00");
  const pass = wallet.balance.amount === "1000.00" && wallet.playerId === playerId;
  return {
    result: {
      name: "criação de wallet",
      pass,
      detail: pass
        ? `wallet ${wallet.id} criada com saldo 1000.00`
        : `resposta inesperada: ${JSON.stringify(wallet)}`,
    },
    wallet,
  };
}

async function checkConcurrentBetsAcrossInstances(
  apps: SpawnedApp[],
  wallet: WalletResponse,
): Promise<CheckResult> {
  const results = await Promise.all(
    apps.map((app, index) =>
      submitWager(app, `fleet-instance-${String(index)}:${randomUUID()}`, {
        providerId: `fleet-instance-${String(index)}`,
        externalTransactionId: randomUUID(),
        playerId: wallet.playerId,
        walletId: wallet.id,
        roundId: "fleet-round",
        gameId: "fleet-game",
        kind: "BET",
        money: { amount: BET_AMOUNT, currency: CURRENCY },
      }),
    ),
  );

  const failures = results.filter((result) => result.status !== 200);
  const expectedBalance = (1000 - apps.length * Number(BET_AMOUNT)).toFixed(2);
  const walletAfter = await getWallet(apps[0]!, wallet.id);
  const pass = failures.length === 0 && walletAfter.balance.amount === expectedBalance;

  return {
    name: `${String(apps.length)} BETs concorrentes, um por instância, contra a mesma wallet`,
    pass,
    detail: pass
      ? `saldo final ${walletAfter.balance.amount} == esperado ${expectedBalance} (sem lost update)`
      : `falhas HTTP: ${String(failures.length)}, saldo final ${walletAfter.balance.amount}, esperado ${expectedBalance}`,
  };
}

async function checkCrossInstanceIdempotency(
  apps: SpawnedApp[],
  wallet: WalletResponse,
): Promise<CheckResult> {
  const idempotencyKey = `fleet-dedup:${randomUUID()}`;
  const body = {
    providerId: "fleet-dedup-provider",
    externalTransactionId: randomUUID(),
    playerId: wallet.playerId,
    walletId: wallet.id,
    roundId: "fleet-round-dedup",
    gameId: "fleet-game",
    kind: "BET" as const,
    money: { amount: "5.00", currency: CURRENCY },
  };

  const first = await submitWager(apps[0]!, idempotencyKey, body);
  const second = await submitWager(apps[apps.length - 1]!, idempotencyKey, body);

  const pass =
    first.status === 200 &&
    second.status === 200 &&
    second.body.idempotentReplay === true &&
    second.body.transactionId === first.body.transactionId &&
    second.body.balance?.amount === first.body.balance?.amount;

  return {
    name: "idempotency-key repetida em outra instância retorna replay dedupado",
    pass,
    detail: pass
      ? `instância 0 processou (tx ${first.body.transactionId}), instância ${String(apps.length - 1)} replayed`
      : `first=${JSON.stringify(first.body)} second=${JSON.stringify(second.body)}`,
  };
}

async function checkReconciliation(
  apps: SpawnedApp[],
  wallet: WalletResponse,
): Promise<CheckResult> {
  const result = await reconcile(apps[apps.length - 1]!, wallet.id);
  return {
    name: "reconciliação na última instância",
    pass: result.consistent,
    detail: result.consistent
      ? `stored=${result.storedBalance.amount} calculated=${result.calculatedBalance.amount} (${String(result.checkedEntries)} lançamentos)`
      : `divergência: stored=${result.storedBalance.amount} calculated=${result.calculatedBalance.amount}`,
  };
}

async function runSmokeBattery(apps: SpawnedApp[]): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  const { result: creationResult, wallet } = await checkWalletCreation(apps);
  checks.push(creationResult);
  if (!creationResult.pass) {
    return checks;
  }

  checks.push(await checkConcurrentBetsAcrossInstances(apps, wallet));
  checks.push(await checkCrossInstanceIdempotency(apps, wallet));
  checks.push(await checkReconciliation(apps, wallet));

  return checks;
}

function printReport(checks: CheckResult[]): boolean {
  console.log("\n=== Smoke battery ===");
  for (const check of checks) {
    const icon = check.pass ? "✔" : "✘";
    console.log(`${icon} ${check.name}\n    ${check.detail}`);
  }
  const passed = checks.filter((check) => check.pass).length;
  console.log(`\n${String(passed)}/${String(checks.length)} checks passaram.`);
  return passed === checks.length;
}

async function main(): Promise<void> {
  console.log(`[fleet] verificando pré-requisitos (postgres, localstack)...`);
  await preflight();

  console.log(
    `[fleet] subindo ${String(FLEET_SIZE)} instâncias (portas ${String(FLEET_BASE_PORT)}..${String(FLEET_BASE_PORT + FLEET_SIZE - 1)})...`,
  );
  const apps: SpawnedApp[] = await Promise.all(
    Array.from({ length: FLEET_SIZE }, (_, index) => spawnApp({ port: FLEET_BASE_PORT + index })),
  );
  console.log("[fleet] todas as instâncias respondendo em /health/ready.");

  let allPassed = false;
  try {
    const checks = await runSmokeBattery(apps);
    allPassed = printReport(checks);
  } catch (error) {
    console.error("[fleet] smoke battery abortada por erro:", error);
  }

  console.log(allPassed ? "\n[fleet] resultado: PASS" : "\n[fleet] resultado: FAIL");
  console.log("\n[fleet] instâncias continuam no ar:");
  for (const app of apps) {
    console.log(
      `  http://localhost:${String(app.port)}  (curl http://localhost:${String(app.port)}/health/ready)`,
    );
  }
  console.log("\n[fleet] Ctrl+C para derrubar a frota.");

  let stopping = false;
  const stopAll = async (): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.log("\n[fleet] derrubando instâncias...");
    await Promise.all(apps.map((app) => app.stop()));
    process.exit(allPassed ? 0 : 1);
  };
  process.on("SIGINT", () => void stopAll());
  process.on("SIGTERM", () => void stopAll());

  await new Promise<void>(() => {});
}

await main();
