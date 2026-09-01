import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { TransactionNotFoundException } from "../../shared/errors/domain-http-exception.js";
import { WagerTransaction } from "../domain/wager-transaction.js";
import { WagerTransactionEntity } from "../infrastructure/persistence/wager-transaction.entity.js";
import { WagerTransactionMapper } from "../infrastructure/persistence/wager-transaction.mapper.js";

@Injectable()
export class GetWagerTransactionByExternalIdUseCase {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(providerId: string, externalTransactionId: string): Promise<WagerTransaction> {
    const entity = await this.dataSource
      .getRepository(WagerTransactionEntity)
      .findOne({ where: { providerId, externalTransactionId } });
    if (entity === null) {
      throw new TransactionNotFoundException(externalTransactionId);
    }
    return WagerTransactionMapper.toDomain(entity);
  }
}
