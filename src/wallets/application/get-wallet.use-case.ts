import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { WalletNotFoundException } from "../../shared/errors/domain-http-exception.js";
import { Wallet } from "../domain/wallet.js";
import { WalletEntity } from "../infrastructure/persistence/wallet.entity.js";
import { WalletMapper } from "../infrastructure/persistence/wallet.mapper.js";

@Injectable()
export class GetWalletUseCase {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(walletId: string): Promise<Wallet> {
    const entity = await this.dataSource.getRepository(WalletEntity).findOne({ where: { id: walletId } });
    if (entity === null) {
      throw new WalletNotFoundException(walletId);
    }
    return WalletMapper.toDomain(entity);
  }
}
