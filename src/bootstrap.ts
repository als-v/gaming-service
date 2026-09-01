import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";

import { ProblemDetailsExceptionFilter } from "./shared/errors/problem-details.filter.js";
import { validationExceptionFactory } from "./shared/errors/validation-exception-factory.js";

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsExceptionFilter());
}
