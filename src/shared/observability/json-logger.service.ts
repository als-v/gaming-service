import type { LoggerService, LogLevel } from "@nestjs/common";

import { currentCausationId, currentCorrelationId } from "./correlation-context.js";

interface ParsedLogParams {
  context: string | undefined;
  trace: string | undefined;
  extra: Record<string, unknown>;
}

function parseOptionalParams(optionalParams: unknown[]): ParsedLogParams {
  const params = [...optionalParams];
  let context: string | undefined;
  const last = params[params.length - 1];
  if (typeof last === "string") {
    context = last;
    params.pop();
  }

  let trace: string | undefined;
  const extra: Record<string, unknown> = {};
  for (const param of params) {
    if (param === undefined || param === null) {
      continue;
    }
    if (param instanceof Error) {
      trace = param.stack ?? param.message;
    } else if (typeof param === "string") {
      trace = param;
    } else if (typeof param === "object") {
      Object.assign(extra, param);
    }
  }

  return { context, trace, extra };
}

export class JsonLogger implements LoggerService {
  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    const { context, trace, extra } = parseOptionalParams(optionalParams);
    const correlationId = currentCorrelationId();
    const causationId = currentCausationId();

    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === "string" ? message : JSON.stringify(message),
      ...(context !== undefined ? { context } : {}),
      ...(correlationId !== undefined ? { correlationId } : {}),
      ...(causationId !== undefined ? { causationId } : {}),
      ...extra,
      ...(trace !== undefined ? { trace } : {}),
    };

    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(record)}\n`);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("log", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("verbose", message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write("fatal", message, optionalParams);
  }
}
