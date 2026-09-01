import { Module } from "@nestjs/common";

import { WalletsController } from "./interface/wallets.controller.js";

@Module({
  controllers: [WalletsController],
})
export class WalletsModule {}
