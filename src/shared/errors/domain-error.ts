import type { FailureCode } from "./failure-code.enum.js";

export abstract class DomainError extends Error {
  abstract readonly failureCode: FailureCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
