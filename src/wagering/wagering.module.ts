import { Module } from "@nestjs/common";

import { AuthModule } from "../shared/auth/auth.module.js";
import { MessagingModule } from "../shared/messaging/messaging.module.js";
import { GetWagerTransactionByExternalIdUseCase } from "./application/get-wager-transaction-by-external-id.use-case.js";
import { GetWagerTransactionByIdUseCase } from "./application/get-wager-transaction-by-id.use-case.js";
import { SubmitWagerTransactionUseCase } from "./application/submit-wager-transaction.use-case.js";
import { PendingReferenceResolverWorker } from "./infrastructure/messaging/pending-reference-resolver.worker.js";
import { WagerTransactionsConsumer } from "./infrastructure/messaging/wager-transactions.consumer.js";
import { ProviderWagerTransactionsController } from "./interface/provider-wager-transactions.controller.js";
import { WagerTransactionsController } from "./interface/wager-transactions.controller.js";

@Module({
  imports: [AuthModule, MessagingModule],
  controllers: [WagerTransactionsController, ProviderWagerTransactionsController],
  providers: [
    SubmitWagerTransactionUseCase,
    GetWagerTransactionByIdUseCase,
    GetWagerTransactionByExternalIdUseCase,
    WagerTransactionsConsumer,
    PendingReferenceResolverWorker,
  ],
})
export class WageringModule {}
