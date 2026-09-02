import { describe, expect, it } from "bun:test";

import { HealthController } from "./health.controller.js";

function buildController(overrides?: {
  dataSourceFails?: boolean;
  sqsFails?: boolean;
}): HealthController {
  const dataSource = {
    createQueryBuilder: () => ({
      select: () => ({
        limit: () => ({
          getRawOne: () =>
            overrides?.dataSourceFails === true
              ? Promise.reject(new Error("connection refused"))
              : Promise.resolve({ ok: 1 }),
        }),
      }),
    }),
  } as never;
  const sqsClient = {
    send: () =>
      overrides?.sqsFails === true
        ? Promise.reject(new Error("queue unreachable"))
        : Promise.resolve({ Attributes: { QueueArn: "arn:aws:sqs:local:queue" } }),
  } as never;
  const queueUrlResolver = {
    resolve: () => Promise.resolve("http://localhost:4566/000000000000/wager-transactions.fifo"),
  } as never;
  return new HealthController(dataSource, sqsClient, queueUrlResolver);
}

describe("HealthController", () => {
  it("responde ok em /health/live", () => {
    expect(buildController().live()).toEqual({ status: "ok" });
  });

  it("responde ok em /health/ready quando Postgres e SQS estão acessíveis", async () => {
    expect(await buildController().ready()).toEqual({ status: "ok" });
  });

  it("lança ServiceUnavailableException em /health/ready quando o Postgres falha", async () => {
    let caught: unknown;
    try {
      await buildController({ dataSourceFails: true }).ready();
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toContain("Postgres indisponível");
  });

  it("lança ServiceUnavailableException em /health/ready quando o SQS falha", async () => {
    let caught: unknown;
    try {
      await buildController({ sqsFails: true }).ready();
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toContain("SQS indisponível");
  });
});
