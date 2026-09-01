import { Money } from "../../../shared/money/money.js";
import { WalletLedgerEntry } from "../../domain/wallet-ledger-entry.js";
import { WalletLedgerEntryEntity } from "./wallet-ledger-entry.entity.js";

export class WalletLedgerEntryMapper {
  static toDomain(entity: WalletLedgerEntryEntity): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction,
      money: Money.from({ amount: entity.amountValue, currency: entity.currency }),
      balanceBefore: Money.from({ amount: entity.balanceBeforeValue, currency: entity.currency }),
      balanceAfter: Money.from({ amount: entity.balanceAfterValue, currency: entity.currency }),
      createdAt: entity.createdAt,
    });
  }

  static toPersistence(entry: WalletLedgerEntry): WalletLedgerEntryEntity {
    const entity = new WalletLedgerEntryEntity();
    entity.id = entry.id;
    entity.walletId = entry.walletId;
    entity.transactionId = entry.transactionId;
    entity.direction = entry.direction;
    entity.currency = entry.money.currency;
    entity.amountValue = entry.money.toJSON().amount;
    entity.balanceBeforeValue = entry.balanceBefore.toJSON().amount;
    entity.balanceAfterValue = entry.balanceAfter.toJSON().amount;
    entity.createdAt = entry.createdAt;
    return entity;
  }
}
