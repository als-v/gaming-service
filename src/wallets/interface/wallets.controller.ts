import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";

import { CreateWalletUseCase } from "../application/create-wallet.use-case.js";
import { GetWalletLedgerUseCase } from "../application/get-wallet-ledger.use-case.js";
import { GetWalletUseCase } from "../application/get-wallet.use-case.js";
import { ReconciliationUseCase } from "../application/reconciliation.use-case.js";
import type { Wallet } from "../domain/wallet.js";
import type { WalletLedgerEntry } from "../domain/wallet-ledger-entry.js";
import { CreateWalletDto } from "./dto/create-wallet.dto.js";
import { GetLedgerQueryDto } from "./dto/get-ledger-query.dto.js";
import type {
  LedgerEntryResponse,
  LedgerPageResponse,
  ReconciliationResponse,
  WalletResponse,
} from "./dto/wallet-response.js";
import { decodeLedgerCursor, encodeLedgerCursor } from "./ledger-cursor.js";

const DEFAULT_LEDGER_PAGE_LIMIT = 50;

function toWalletResponse(wallet: Wallet): WalletResponse {
  return {
    id: wallet.id,
    playerId: wallet.playerId,
    balance: wallet.balance.toJSON(),
    version: wallet.version,
  };
}

function toLedgerEntryResponse(entry: WalletLedgerEntry): LedgerEntryResponse {
  return {
    id: entry.id,
    walletId: entry.walletId,
    transactionId: entry.transactionId,
    direction: entry.direction,
    money: entry.money.toJSON(),
    balanceBefore: entry.balanceBefore.toJSON(),
    balanceAfter: entry.balanceAfter.toJSON(),
    createdAt: entry.createdAt.toISOString(),
  };
}

@Controller("wallets")
export class WalletsController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly getWalletLedgerUseCase: GetWalletLedgerUseCase,
    private readonly reconciliationUseCase: ReconciliationUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateWalletDto): Promise<WalletResponse> {
    const wallet = await this.createWalletUseCase.execute({
      playerId: dto.playerId,
      initialBalance: dto.initialBalance,
    });
    return toWalletResponse(wallet);
  }

  @Get(":walletId")
  @HttpCode(HttpStatus.OK)
  async findOne(@Param("walletId") walletId: string): Promise<WalletResponse> {
    const wallet = await this.getWalletUseCase.execute(walletId);
    return toWalletResponse(wallet);
  }

  @Get(":walletId/ledger")
  @HttpCode(HttpStatus.OK)
  async ledger(
    @Param("walletId") walletId: string,
    @Query() query: GetLedgerQueryDto,
  ): Promise<LedgerPageResponse> {
    await this.getWalletUseCase.execute(walletId);
    const limit = query.limit ?? DEFAULT_LEDGER_PAGE_LIMIT;
    const cursor = query.cursor === undefined ? undefined : decodeLedgerCursor(query.cursor);

    const page = await this.getWalletLedgerUseCase.execute({ walletId, limit, cursor });
    return {
      items: page.items.map(toLedgerEntryResponse),
      limit,
      nextCursor: page.nextCursor === undefined ? null : encodeLedgerCursor(page.nextCursor),
    };
  }

  @Post(":walletId/reconciliation")
  @HttpCode(HttpStatus.OK)
  async reconcile(@Param("walletId") walletId: string): Promise<ReconciliationResponse> {
    const result = await this.reconciliationUseCase.execute(walletId);
    return {
      walletId: result.walletId,
      storedBalance: result.storedBalance.toJSON(),
      calculatedBalance: result.calculatedBalance.toJSON(),
      difference: result.difference.toJSON(),
      consistent: result.consistent,
      checkedEntries: result.checkedEntries,
    };
  }
}
