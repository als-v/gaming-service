import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";

import { AppModule } from "./app.module.js";
import { configureApp } from "./bootstrap.js";
import { JsonLogger } from "./shared/observability/json-logger.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(new JsonLogger());

  const logger = new Logger("Bootstrap");
  const port = Number(process.env.PORT ?? 3000);

  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`server rodando na porta ${port}`);
}

void bootstrap();
