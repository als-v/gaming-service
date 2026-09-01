import { InboxMessage } from "../../inbox-message.js";
import { InboxMessageEntity } from "./inbox-message.entity.js";

export class InboxMessageMapper {
  static toDomain(entity: InboxMessageEntity): InboxMessage {
    return InboxMessage.rehydrate({
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt ?? undefined,
    });
  }

  static toPersistence(message: InboxMessage): InboxMessageEntity {
    const entity = new InboxMessageEntity();
    entity.messageId = message.messageId;
    entity.consumerName = message.consumerName;
    entity.payloadHash = message.payloadHash;
    entity.receivedAt = message.receivedAt;
    entity.processedAt = message.processedAt ?? null;
    return entity;
  }
}
