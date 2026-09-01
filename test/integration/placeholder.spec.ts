import { describe, expect, it } from "bun:test";

import { buildTypeOrmOptions } from "../../src/database/database.config.js";

describe("bootstrap de integração (placeholder)", () => {
  it("resolve a configuração de conexão do TypeORM sem lançar", () => {
    const options = buildTypeOrmOptions({ ...process.env });

    expect(options.type).toBe("postgres");
    expect(options).toHaveProperty("synchronize", false);
  });
});
