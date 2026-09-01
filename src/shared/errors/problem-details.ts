import type { FailureCode } from "./failure-code.enum.js";

export interface ValidationErrorItem {
  field: string;
  constraints: string[];
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  failureCode: FailureCode;
  detail: string;
  traceId: string;
  errors?: ValidationErrorItem[];
}

export function problemTypeFor(failureCode: FailureCode): string {
  const kebabCase = failureCode.toLowerCase().replace(/_/g, "-");
  return `https://docs.internal/errors/${kebabCase}`;
}
