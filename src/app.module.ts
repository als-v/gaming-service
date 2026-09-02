import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./shared/auth/auth.module.js";
import { MessagingModule } from "./shared/messaging/messaging.module.js";
import { WageringModule } from "./wagering/wagering.module.js";
import { WalletsModule } from "./wallets/wallets.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    MessagingModule,
    WalletsModule,
    WageringModule,
  ],
})
export class AppModule {}
