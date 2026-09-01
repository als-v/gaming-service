import { FailureCode } from "../errors/failure-code.enum.js";
import type { MoneyProps } from "../money/money.js";
import type { WagerTransaction } from "../../wagering/domain/wager-transaction.js";
import type { WagerTransactionKind } from "../../wagering/domain/wager-transaction-kind.enum.js";
import type { EventContext } from "./integration-event.js";
import { IntegrationEvent, IntegrationEventPreconditionError } from "./integration-event.js";

export interface WagerTransactionRejectedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  failureCode: FailureCode;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = "WagerTransactionRejected";
  readonly version = 1;

  static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionRejected {
    const failureCode = transaction.failureCode;
    if (failureCode === undefined) {
      throw new IntegrationEventPreconditionError(
        "WagerTransactionRejected",
        "a transação não tem failureCode",
      );
    }
    return new WagerTransactionRejected({
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
        failureCode,
      },
    });
  }
}
