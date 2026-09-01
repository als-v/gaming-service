import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";

import { AppModule } from "./app.module.js";
import { configureApp } from "./bootstrap.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = new Logger("Bootstrap");
  const port = Number(process.env.PORT ?? 3000);

  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`server rodando na porta ${port}`);
}

void bootstrap();
