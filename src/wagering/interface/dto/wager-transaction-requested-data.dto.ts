import { IsNotEmpty, IsString } from "class-validator";

import { SubmitWagerTransactionDto } from "./submit-wager-transaction.dto.js";

export class WagerTransactionRequestedDataDto extends SubmitWagerTransactionDto {
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}
