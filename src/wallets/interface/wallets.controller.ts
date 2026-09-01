import { randomUUID } from "node:crypto";

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";

import { CreateWalletDto } from "./dto/create-wallet.dto.js";
import { GetLedgerQueryDto } from "./dto/get-ledger-query.dto.js";
import type {
  LedgerPageResponse,
  ReconciliationResponse,
  WalletResponse,
} from "./dto/wallet-response.js";
import { decodeLedgerCursor } from "./ledger-cursor.js";

@Controller("wallets")
export class WalletsController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWalletDto): WalletResponse {
    return {
      id: randomUUID(),
      playerId: dto.playerId,
      balance: dto.initialBalance,
      version: 1,
    };
  }

  @Get(":walletId")
  @HttpCode(HttpStatus.OK)
  findOne(@Param("walletId") walletId: string): WalletResponse {
    return {
      id: walletId,
      playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
      balance: { amount: "1000.00", currency: "BRL" },
      version: 1,
    };
  }

  @Get(":walletId/ledger")
  @HttpCode(HttpStatus.OK)
  ledger(
    @Param("walletId") _walletId: string,
    @Query() query: GetLedgerQueryDto,
  ): LedgerPageResponse {
    if (query.cursor !== undefined) {
      decodeLedgerCursor(query.cursor);
    }
    return {
      items: [],
      limit: query.limit ?? 50,
      nextCursor: null,
    };
  }

  @Post(":walletId/reconciliation")
  @HttpCode(HttpStatus.OK)
  reconcile(@Param("walletId") walletId: string): ReconciliationResponse {
    return {
      walletId,
      storedBalance: { amount: "0.00", currency: "BRL" },
      calculatedBalance: { amount: "0.00", currency: "BRL" },
      difference: { amount: "0.00", currency: "BRL" },
      consistent: true,
      checkedEntries: 0,
    };
  }
}
