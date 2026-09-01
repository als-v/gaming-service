import { Controller, Get, HttpCode, HttpStatus, Param } from "@nestjs/common";

import {
  placeholderWagerTransaction,
  type WagerTransactionResponse,
} from "./wager-transaction-response.js";

@Controller("providers/:providerId/wagering/transactions")
export class ProviderWagerTransactionsController {
  @Get(":externalTransactionId")
  @HttpCode(HttpStatus.OK)
  findOne(
    @Param("providerId") providerId: string,
    @Param("externalTransactionId") externalTransactionId: string,
  ): WagerTransactionResponse {
    return placeholderWagerTransaction({ providerId, externalTransactionId });
  }
}
