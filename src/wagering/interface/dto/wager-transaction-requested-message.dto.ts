import { Type } from "class-transformer";
import { Equals, IsISO8601, IsString, IsNotEmpty, ValidateNested } from "class-validator";

import { WagerTransactionRequestedDataDto } from "./wager-transaction-requested-data.dto.js";

export class WagerTransactionRequestedMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @Equals("WagerTransactionRequested")
  type!: "WagerTransactionRequested";

  @IsISO8601()
  occurredAt!: string;

  @ValidateNested()
  @Type(() => WagerTransactionRequestedDataDto)
  data!: WagerTransactionRequestedDataDto;
}
