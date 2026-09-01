import type { DataSourceOptions } from "typeorm";

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value;
}

export function buildTypeOrmOptions(env: NodeJS.ProcessEnv = process.env): DataSourceOptions {
  const isProduction = env["NODE_ENV"] === "production";

  return {
    type: "postgres",
    host: requireEnv(env, "DATABASE_HOST"),
    port: Number(requireEnv(env, "DATABASE_PORT")),
    username: requireEnv(env, "DATABASE_USER"),
    password: requireEnv(env, "DATABASE_PASSWORD"),
    database: requireEnv(env, "DATABASE_NAME"),
    ssl: env["DATABASE_SSL"] === "true",
    synchronize: false,
    logging: env["DATABASE_LOGGING"] === "true",
    entities: [isProduction ? "dist/**/*.entity.js" : "src/**/*.entity.ts"],
    migrations: [isProduction ? "dist/database/migrations/*.js" : "src/database/migrations/*.ts"],
    migrationsTableName: "typeorm_migrations",
  };
}
