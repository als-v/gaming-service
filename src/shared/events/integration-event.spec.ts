import { randomUUID } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { IntegrationEvent, type IntegrationEventProps } from "./integration-event.js";

interface SampleData {
  foo: string;
}

class SampleEvent extends IntegrationEvent<SampleData> {
  readonly eventType = "SampleEvent";
  readonly version = 1;

  static from(props: IntegrationEventProps<SampleData>): SampleEvent {
    return new SampleEvent(props);
  }
}

describe("IntegrationEvent", () => {
  it("toJSON produz o envelope serializado com eventType/version fixados na subclasse", () => {
    const occurredAt = new Date("2026-01-01T00:00:00.000Z");
    const props: IntegrationEventProps<SampleData> = {
      eventId: randomUUID(),
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      causationId: undefined,
      occurredAt,
      data: { foo: "bar" },
    };
    const event = SampleEvent.from(props);

    expect(event.toJSON()).toEqual({
      eventId: props.eventId,
      eventType: "SampleEvent",
      aggregateId: props.aggregateId,
      correlationId: props.correlationId,
      causationId: undefined,
      occurredAt: occurredAt.toISOString(),
      version: 1,
      data: { foo: "bar" },
    });
  });

  it("preserva causationId quando informado", () => {
    const causationId = randomUUID();
    const event = SampleEvent.from({
      eventId: randomUUID(),
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      causationId,
      occurredAt: new Date(),
      data: { foo: "bar" },
    });
    expect(event.toJSON().causationId).toBe(causationId);
  });
});
