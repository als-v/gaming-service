import { randomUUID } from "node:crypto";

import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";

import { DomainHttpException, ValidationFailedException } from "./domain-http-exception.js";
import { FailureCode } from "./failure-code.enum.js";
import { problemTypeFor, type ProblemDetails } from "./problem-details.js";

function extractDetail(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === "string") {
    return response;
  }
  if (typeof response === "object" && response !== null && "message" in response) {
    const { message } = response;
    return Array.isArray(message) ? message.join(" ") : String(message);
  }
  return exception.message;
}

@Catch()
export class ProblemDetailsExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const traceId = randomUUID();

    if (exception instanceof DomainHttpException) {
      const status = exception.getStatus();
      const body: ProblemDetails = {
        type: problemTypeFor(exception.failureCode),
        title: exception.title,
        status,
        failureCode: exception.failureCode,
        detail: exception.message,
        traceId,
        ...(exception instanceof ValidationFailedException ? { errors: exception.errors } : {}),
      };
      response.status(status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: ProblemDetails = {
        type: problemTypeFor(FailureCode.UnexpectedError),
        title: "Unexpected error",
        status,
        failureCode: FailureCode.UnexpectedError,
        detail: extractDetail(exception),
        traceId,
      };
      response.status(status).json(body);
      return;
    }

    const body: ProblemDetails = {
      type: problemTypeFor(FailureCode.InternalError),
      title: "Internal server error",
      status: 500,
      failureCode: FailureCode.InternalError,
      detail: "Erro interno inesperado.",
      traceId,
    };
    response.status(500).json(body);
  }
}
