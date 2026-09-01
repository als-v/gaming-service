import { Module } from "@nestjs/common";

import { AuthModule } from "../shared/auth/auth.module.js";
import { ProviderWagerTransactionsController } from "./interface/provider-wager-transactions.controller.js";
import { WagerTransactionsController } from "./interface/wager-transactions.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [WagerTransactionsController, ProviderWagerTransactionsController],
})
export class WageringModule {}
