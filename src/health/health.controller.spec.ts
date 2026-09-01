import { describe, expect, it } from "bun:test";

import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  const controller = new HealthController();

  it("responde ok em /health/live", () => {
    expect(controller.live()).toEqual({ status: "ok" });
  });

  it("responde ok em /health/ready (fixo nesta etapa — sem checar Postgres/SQS ainda)", () => {
    expect(controller.ready()).toEqual({ status: "ok" });
  });
});
