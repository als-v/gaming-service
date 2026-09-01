import { Type } from "class-transformer";
import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";

import { MoneyDto } from "../../../shared/money/money.dto.js";
import {
  SUBMITTABLE_WAGER_TRANSACTION_KINDS,
  type SubmittableWagerTransactionKind,
} from "./submittable-wager-transaction-kind.js";

export class SubmitWagerTransactionDto {
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsIn(SUBMITTABLE_WAGER_TRANSACTION_KINDS)
  kind!: SubmittableWagerTransactionKind;

  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referenceExternalTransactionId?: string;
}
