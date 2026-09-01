import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import type { LedgerCursor } from "../interface/ledger-cursor.js";
import { WalletLedgerEntry } from "../domain/wallet-ledger-entry.js";
import { WalletLedgerEntryEntity } from "../infrastructure/persistence/wallet-ledger-entry.entity.js";
import { WalletLedgerEntryMapper } from "../infrastructure/persistence/wallet-ledger-entry.mapper.js";

export interface GetWalletLedgerQuery {
  walletId: string;
  limit: number;
  cursor: LedgerCursor | undefined;
}

export interface GetWalletLedgerPage {
  items: WalletLedgerEntry[];
  nextCursor: LedgerCursor | undefined;
}

@Injectable()
export class GetWalletLedgerUseCase {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: GetWalletLedgerQuery): Promise<GetWalletLedgerPage> {
    const queryBuilder = this.dataSource
      .getRepository(WalletLedgerEntryEntity)
      .createQueryBuilder("entry")
      .where("entry.wallet_id = :walletId", { walletId: query.walletId })
      .orderBy("entry.created_at", "ASC")
      .addOrderBy("entry.id", "ASC")
      .take(query.limit + 1);

    if (query.cursor !== undefined) {
      queryBuilder.andWhere("(entry.created_at, entry.id) > (:cursorCreatedAt, :cursorId)", {
        cursorCreatedAt: query.cursor.createdAt,
        cursorId: query.cursor.id,
      });
    }

    const entities = await queryBuilder.getMany();
    const hasMore = entities.length > query.limit;
    const page = hasMore ? entities.slice(0, query.limit) : entities;
    const items = page.map((entity) => WalletLedgerEntryMapper.toDomain(entity));

    const last = page.at(-1);
    const nextCursor: LedgerCursor | undefined =
      hasMore && last !== undefined ? { createdAt: last.createdAt.toISOString(), id: last.id } : undefined;

    return { items, nextCursor };
  }
}
