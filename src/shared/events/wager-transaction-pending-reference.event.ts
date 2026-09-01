import type { MoneyProps } from "../money/money.js";
import type { WagerTransaction } from "../../wagering/domain/wager-transaction.js";
import type { WagerTransactionKind } from "../../wagering/domain/wager-transaction-kind.enum.js";
import type { EventContext } from "./integration-event.js";
import { IntegrationEvent, IntegrationEventPreconditionError } from "./integration-event.js";

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = "WagerTransactionPendingReference";
  readonly version = 1;

  static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionPendingReference {
    const referenceExternalTransactionId = transaction.referenceExternalTransactionId;
    if (referenceExternalTransactionId === undefined) {
      throw new IntegrationEventPreconditionError(
        "WagerTransactionPendingReference",
        "a transação não tem referenceExternalTransactionId",
      );
    }
    return new WagerTransactionPendingReference({
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
        referenceExternalTransactionId,
      },
    });
  }
}
