import { randomUUID } from "node:crypto";

import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";

import { runWithCorrelation } from "./correlation-context.js";

const CORRELATION_HEADER = "x-correlation-id";

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const headerValue = request.headers[CORRELATION_HEADER];
    const correlationId = (Array.isArray(headerValue) ? headerValue[0] : headerValue) ?? randomUUID();
    response.setHeader(CORRELATION_HEADER, correlationId);

    return runWithCorrelation({ correlationId, causationId: undefined }, () => next.handle());
  }
}
