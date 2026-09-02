import { Module } from "@nestjs/common";

import { ObservabilityModule } from "../shared/observability/observability.module.js";
import { CreateWalletUseCase } from "./application/create-wallet.use-case.js";
import { GetWalletLedgerUseCase } from "./application/get-wallet-ledger.use-case.js";
import { GetWalletUseCase } from "./application/get-wallet.use-case.js";
import { ReconciliationUseCase } from "./application/reconciliation.use-case.js";
import { WalletsController } from "./interface/wallets.controller.js";

@Module({
  imports: [ObservabilityModule],
  controllers: [WalletsController],
  providers: [CreateWalletUseCase, GetWalletUseCase, GetWalletLedgerUseCase, ReconciliationUseCase],
})
export class WalletsModule {}
