import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from "@nestjs/common";

import {
  PROVIDER_IDENTITY_PORT,
  type ProviderIdentityPort,
} from "../../shared/auth/provider-identity.port.js";
import { GetWagerTransactionByIdUseCase } from "../application/get-wager-transaction-by-id.use-case.js";
import { SubmitWagerTransactionUseCase } from "../application/submit-wager-transaction.use-case.js";
import { SubmitWagerTransactionDto } from "./dto/submit-wager-transaction.dto.js";
import { IdempotencyKeyGuard } from "./idempotency-key.guard.js";
import {
  toWagerTransactionResponse,
  type SubmitWagerTransactionResponse,
  type WagerTransactionResponse,
} from "./wager-transaction-response.js";

@Controller("wagering/transactions")
export class WagerTransactionsController {
  constructor(
    @Inject(PROVIDER_IDENTITY_PORT) private readonly providerIdentity: ProviderIdentityPort,
    private readonly submitWagerTransactionUseCase: SubmitWagerTransactionUseCase,
    private readonly getWagerTransactionByIdUseCase: GetWagerTransactionByIdUseCase,
  ) {}

  @Post()
  @UseGuards(IdempotencyKeyGuard)
  @HttpCode(HttpStatus.OK)
  async submit(
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() dto: SubmitWagerTransactionDto,
  ): Promise<SubmitWagerTransactionResponse> {
    this.providerIdentity.currentProviderId();
    const result = await this.submitWagerTransactionUseCase.execute({
      idempotencyKey,
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      playerId: dto.playerId,
      walletId: dto.walletId,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      money: dto.money,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
    });
    return {
      transactionId: result.transaction.id,
      status: result.transaction.status,
      balance: result.walletBalance,
      idempotentReplay: result.idempotentReplay,
    };
  }

  @Get(":transactionId")
  @HttpCode(HttpStatus.OK)
  async findOne(@Param("transactionId") transactionId: string): Promise<WagerTransactionResponse> {
    const transaction = await this.getWagerTransactionByIdUseCase.execute(transactionId);
    return toWagerTransactionResponse(transaction);
  }
}
