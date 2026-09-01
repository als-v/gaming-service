import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { buildTypeOrmOptions } from "./database.config.js";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => buildTypeOrmOptions(),
    }),
  ],
})
export class DatabaseModule {}
