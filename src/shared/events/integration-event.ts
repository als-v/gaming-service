export interface IntegrationEventProps<T> {
  eventId: string;
  aggregateId: string;
  correlationId: string;
  causationId: string | undefined;
  occurredAt: Date;
  data: T;
}

export interface IntegrationEventEnvelope<T> {
  [key: string]: unknown;
  eventId: string;
  eventType: string;
  aggregateId: string;
  correlationId: string;
  causationId: string | undefined;
  occurredAt: string;
  version: number;
  data: T;
}

export interface EventContext {
  eventId: string;
  correlationId: string;
  causationId: string | undefined;
  occurredAt: Date;
}

export class IntegrationEventPreconditionError extends Error {
  constructor(eventType: string, reason: string) {
    super(`Não é possível construir o evento "${eventType}": ${reason}.`);
    this.name = new.target.name;
  }
}

export abstract class IntegrationEvent<T> {
  abstract readonly eventType: string;
  abstract readonly version: number;

  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly correlationId: string;
  public readonly causationId: string | undefined;
  public readonly occurredAt: Date;
  public readonly data: Readonly<T>;

  protected constructor(props: IntegrationEventProps<T>) {
    this.eventId = props.eventId;
    this.aggregateId = props.aggregateId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.occurredAt = props.occurredAt;
    this.data = props.data;
  }

  toJSON(): IntegrationEventEnvelope<T> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      occurredAt: this.occurredAt.toISOString(),
      version: this.version,
      data: this.data,
    };
  }
}
