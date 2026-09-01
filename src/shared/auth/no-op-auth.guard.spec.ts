import { describe, expect, it } from "bun:test";

import { NoOpAuthGuard } from "./no-op-auth.guard.js";

describe("NoOpAuthGuard", () => {
  it("sempre permite a requisição", () => {
    expect(new NoOpAuthGuard().canActivate()).toBe(true);
  });
});
