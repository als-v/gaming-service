import { Controller, Get, HttpCode, HttpStatus, Param } from "@nestjs/common";

import { GetWagerTransactionByExternalIdUseCase } from "../application/get-wager-transaction-by-external-id.use-case.js";
import { toWagerTransactionResponse, type WagerTransactionResponse } from "./wager-transaction-response.js";

@Controller("providers/:providerId/wagering/transactions")
export class ProviderWagerTransactionsController {
  constructor(
    private readonly getWagerTransactionByExternalIdUseCase: GetWagerTransactionByExternalIdUseCase,
  ) {}

  @Get(":externalTransactionId")
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param("providerId") providerId: string,
    @Param("externalTransactionId") externalTransactionId: string,
  ): Promise<WagerTransactionResponse> {
    const transaction = await this.getWagerTransactionByExternalIdUseCase.execute(
      providerId,
      externalTransactionId,
    );
    return toWagerTransactionResponse(transaction);
  }
}
