import type { MoneyProps } from "../money/money.js";
import type { WagerTransaction } from "../../wagering/domain/wager-transaction.js";
import type { WagerTransactionKind } from "../../wagering/domain/wager-transaction-kind.enum.js";
import type { EventContext } from "./integration-event.js";
import { IntegrationEvent, IntegrationEventPreconditionError } from "./integration-event.js";

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceTransactionId: string | undefined;
  processedAt: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = "WagerTransactionProcessed";
  readonly version = 1;

  static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
    const processedAt = transaction.processedAt;
    if (processedAt === undefined) {
      throw new IntegrationEventPreconditionError(
        "WagerTransactionProcessed",
        "a transação não tem processedAt",
      );
    }
    return new WagerTransactionProcessed({
      eventId: ctx.eventId,
      aggregateId: transaction.walletId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: ctx.occurredAt,
      data: {
        transactionId: transaction.id,
        providerId: transaction.providerId,
        externalTransactionId: transaction.externalTransactionId,
        walletId: transaction.walletId,
        playerId: transaction.playerId,
        roundId: transaction.roundId,
        gameId: transaction.gameId,
        kind: transaction.kind,
        money: transaction.money.toJSON(),
        referenceTransactionId: transaction.referenceTransactionId,
        processedAt: processedAt.toISOString(),
      },
    });
  }
}
