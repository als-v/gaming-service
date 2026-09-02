import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface SpawnedApp {
  process: ChildProcessWithoutNullStreams;
  port: number;
  stdout: string[];
  stderr: string[];
  waitForExit(): Promise<number | null>;
  stop(signal?: NodeJS.Signals): Promise<void>;
}

export interface SpawnAppOptions {
  port: number;
  env?: Record<string, string>;
  readyTimeoutMs?: number;
}

const DEFAULT_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

export async function spawnApp(options: SpawnAppOptions): Promise<SpawnedApp> {
  const child = spawn("bun", ["src/main.ts"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...options.env,
      PORT: String(options.port),
    },
  });

  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));

  let exitCode: number | null = null;
  let exitResolve: ((code: number | null) => void) | undefined;
  const exitPromise = new Promise<number | null>((resolve) => {
    exitResolve = resolve;
  });
  child.once("exit", (code) => {
    exitCode = code;
    exitResolve?.(code);
  });

  await waitForReady(child, options.port, options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS, stderr);

  return {
    process: child,
    port: options.port,
    stdout,
    stderr,
    waitForExit: () => (exitCode !== null ? Promise.resolve(exitCode) : exitPromise),
    stop: (signal: NodeJS.Signals = "SIGTERM") => stopApp(child, signal),
  };
}

function waitForReady(
  child: ChildProcessWithoutNullStreams,
  port: number,
  timeoutMs: number,
  stderr: string[],
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    let settled = false;
    const onExit = (code: number | null) => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `Processo encerrou prematuramente (code=${String(code)}) antes de ficar pronto na porta ${port}. stderr: ${stderr.join("")}`,
          ),
        );
      }
    };
    child.once("exit", onExit);

    const poll = async (): Promise<void> => {
      if (settled) {
        return;
      }
      if (Date.now() > deadline) {
        settled = true;
        child.off("exit", onExit);
        reject(new Error(`Timeout aguardando app ficar pronto na porta ${port}.`));
        return;
      }
      try {
        const response = await fetch(`http://localhost:${port}/health/ready`);
        if (response.ok) {
          settled = true;
          child.off("exit", onExit);
          resolve();
          return;
        }
      } catch {
        /* empty */
      }
      setTimeout(() => void poll(), 200);
    };

    void poll();
  });
}

function stopApp(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill(signal);
  });
}
