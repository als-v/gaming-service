import { AsyncLocalStorage } from "node:async_hooks";

export interface CorrelationStore {
  correlationId: string;
  causationId: string | undefined;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

export function runWithCorrelation<T>(store: CorrelationStore, fn: () => T): T {
  return storage.run(store, fn);
}

export function currentCorrelationStore(): CorrelationStore | undefined {
  return storage.getStore();
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function currentCausationId(): string | undefined {
  return storage.getStore()?.causationId;
}
