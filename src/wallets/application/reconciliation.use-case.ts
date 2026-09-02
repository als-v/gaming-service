import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { WalletNotFoundException } from "../../shared/errors/domain-http-exception.js";
import { Money } from "../../shared/money/money.js";
import { MetricsService } from "../../shared/observability/metrics.service.js";
import { LedgerDirection } from "../domain/ledger-direction.enum.js";
import { WalletLedgerEntryEntity } from "../infrastructure/persistence/wallet-ledger-entry.entity.js";
import { WalletEntity } from "../infrastructure/persistence/wallet.entity.js";
import { WalletMapper } from "../infrastructure/persistence/wallet.mapper.js";

export interface ReconciliationResult {
  walletId: string;
  storedBalance: Money;
  calculatedBalance: Money;
  difference: Money;
  consistent: boolean;
  checkedEntries: number;
}

@Injectable()
export class ReconciliationUseCase {
  private readonly logger = new Logger(ReconciliationUseCase.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly metrics: MetricsService,
  ) {}

  async execute(walletId: string): Promise<ReconciliationResult> {
    const walletEntity = await this.dataSource
      .getRepository(WalletEntity)
      .findOne({ where: { id: walletId } });
    if (walletEntity === null) {
      throw new WalletNotFoundException(walletId);
    }
    const wallet = WalletMapper.toDomain(walletEntity);

    const entries = await this.dataSource
      .getRepository(WalletLedgerEntryEntity)
      .find({ where: { walletId } });

    const calculatedBalance = entries.reduce((balance, entry) => {
      const amount = Money.from({ amount: entry.amountValue, currency: entry.currency });
      return entry.direction === LedgerDirection.Credit ? balance.add(amount) : balance.subtract(amount);
    }, Money.zero(wallet.currency));

    const consistent = calculatedBalance.equals(wallet.balance);
    const difference = wallet.balance.subtract(calculatedBalance);

    if (!consistent) {
      this.metrics.recordReconciliationDivergence();
      this.logger.error(
        `Divergência de reconciliação na wallet "${walletId}": stored=${wallet.balance.toString()}, ` +
          `calculated=${calculatedBalance.toString()}, difference=${difference.toString()}.`,
        { walletId },
      );
    }

    return {
      walletId,
      storedBalance: wallet.balance,
      calculatedBalance,
      difference,
      consistent,
      checkedEntries: entries.length,
    };
  }
}
