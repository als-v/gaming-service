import { randomUUID } from "node:crypto";

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  PROVIDER_IDENTITY_PORT,
  type ProviderIdentityPort,
} from "../../shared/auth/provider-identity.port.js";
import { SubmitWagerTransactionDto } from "./dto/submit-wager-transaction.dto.js";
import { IdempotencyKeyGuard } from "./idempotency-key.guard.js";
import {
  placeholderWagerTransaction,
  type SubmitWagerTransactionResponse,
  type WagerTransactionResponse,
} from "./wager-transaction-response.js";

@Controller("wagering/transactions")
export class WagerTransactionsController {
  constructor(
    @Inject(PROVIDER_IDENTITY_PORT) private readonly providerIdentity: ProviderIdentityPort,
  ) {}

  @Post()
  @UseGuards(IdempotencyKeyGuard)
  @HttpCode(HttpStatus.OK)
  submit(
    @Headers("idempotency-key") _idempotencyKey: string,
    @Body() dto: SubmitWagerTransactionDto,
  ): SubmitWagerTransactionResponse {
    this.providerIdentity.currentProviderId();
    return {
      transactionId: randomUUID(),
      status: "PROCESSED",
      balance: dto.money,
      idempotentReplay: false,
    };
  }

  @Get(":transactionId")
  @HttpCode(HttpStatus.OK)
  findOne(@Param("transactionId") transactionId: string): WagerTransactionResponse {
    return placeholderWagerTransaction({ transactionId });
  }
}
