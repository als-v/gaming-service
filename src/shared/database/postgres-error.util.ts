const UNIQUE_VIOLATION_CODE = "23505";
const DEADLOCK_DETECTED_CODE = "40P01";
const SERIALIZATION_FAILURE_CODE = "40001";

interface PostgresDriverError {
  code?: string;
  constraint?: string;
}

function driverErrorOf(error: unknown): PostgresDriverError | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const candidate = error as Error & PostgresDriverError & { driverError?: PostgresDriverError };
  if (typeof candidate.code === "string") {
    return candidate;
  }
  if (candidate.driverError !== undefined && typeof candidate.driverError.code === "string") {
    return candidate.driverError;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const driverError = driverErrorOf(error);
  if (driverError === undefined || driverError.code !== UNIQUE_VIOLATION_CODE) {
    return false;
  }
  return constraint === undefined || driverError.constraint === constraint;
}

export function isTransientTransactionError(error: unknown): boolean {
  const driverError = driverErrorOf(error);
  if (driverError === undefined) {
    return false;
  }
  return driverError.code === DEADLOCK_DETECTED_CODE || driverError.code === SERIALIZATION_FAILURE_CODE;
}

export function postgresErrorCodeOf(error: unknown): string | undefined {
  return driverErrorOf(error)?.code;
}
