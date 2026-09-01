import { Matches } from "class-validator";

import { CURRENCY_CODE_PATTERN, MONEY_AMOUNT_PATTERN } from "./money-format.js";

export class MoneyDto {
  @Matches(MONEY_AMOUNT_PATTERN, {
    message:
      'amount deve ser uma string decimal não negativa com escala fixa de 2 casas (ex.: "25.00").',
  })
  amount!: string;

  @Matches(CURRENCY_CODE_PATTERN, {
    message: 'currency deve ser um código ISO-4217 de 3 letras maiúsculas (ex.: "BRL").',
  })
  currency!: string;
}
