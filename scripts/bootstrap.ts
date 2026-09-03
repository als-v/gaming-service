import { copyFileSync, existsSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { spawnApp, type SpawnedApp } from "../test/integration/helpers/spawn-app.js";

const execFileAsync = promisify(execFile);

const REPO_ROOT = new URL("../", import.meta.url).pathname;
const ARGS = process.argv.slice(2);
const OBSERVABILITY = ARGS.includes("--observability");
const INSTANCES_ARG = ARGS.find((arg) => arg.startsWith("--instances="));
const INSTANCES = INSTANCES_ARG === undefined ? 1 : Number(INSTANCES_ARG.split("=")[1]);
const BASE_PORT = Number(process.env.PORT ?? "3000");
const HEALTH_TIMEOUT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command: string, args: string[]): Promise<void> {
  console.log(`[bootstrap] $ ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`"${command} ${args.join(" ")}" saiu com code ${String(code)}`));
      }
    });
  });
}

function ensureEnvFile(): void {
  const envPath = `${REPO_ROOT}.env`;
  const examplePath = `${REPO_ROOT}.env.example`;
  if (existsSync(envPath)) {
    return;
  }
  copyFileSync(examplePath, envPath);
  console.log(
    "[bootstrap] .env não existia — copiado de .env.example. Revise os valores antes de continuar.",
  );
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
    return "desconhecido";
  }
}

async function waitForHealthy(containerName: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  for (;;) {
    const status = await containerHealth(containerName);
    if (status === "healthy") {
      console.log(`[bootstrap] ${containerName}: healthy`);
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timeout aguardando "${containerName}" ficar healthy (último status: ${status}).`,
      );
    }
    await sleep(1000);
  }
}

async function runSingleInstance(): Promise<void> {
  console.log(
    `[bootstrap] subindo a API em foreground na porta ${String(BASE_PORT)} (bun run dev)...`,
  );
  await run("bun", ["run", "dev"]);
}

async function runMultipleInstances(count: number): Promise<void> {
  console.log(
    `[bootstrap] subindo ${String(count)} instâncias da API (portas ${String(BASE_PORT)}..${String(BASE_PORT + count - 1)})...`,
  );
  const apps: SpawnedApp[] = [];
  for (let i = 0; i < count; i += 1) {
    const port = BASE_PORT + i;
    const app = await spawnApp({ port });
    apps.push(app);
    console.log(`[bootstrap] instância pronta em http://localhost:${String(port)}`);
  }

  console.log("\n[bootstrap] todas as instâncias no ar. Ctrl+C para derrubar todas.");

  let stopping = false;
  const stopAll = async (): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.log("\n[bootstrap] derrubando instâncias...");
    await Promise.all(apps.map((app) => app.stop()));
    process.exit(0);
  };
  process.on("SIGINT", () => void stopAll());
  process.on("SIGTERM", () => void stopAll());

  await new Promise<void>(() => {});
}

async function main(): Promise<void> {
  ensureEnvFile();

  const composeServices = OBSERVABILITY
    ? ["postgres", "localstack", "prometheus", "grafana"]
    : ["postgres", "localstack"];
  await run("docker", ["compose", "up", "-d", ...composeServices]);

  await waitForHealthy("gaming-service-postgres");
  await waitForHealthy("gaming-service-localstack");

  await run("bun", ["install"]);
  await run("bun", ["run", "migration:run"]);

  if (INSTANCES <= 1) {
    await runSingleInstance();
  } else {
    await runMultipleInstances(INSTANCES);
  }
}

await main();
