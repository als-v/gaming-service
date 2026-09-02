import { Module } from "@nestjs/common";

import { MessagingModule } from "../messaging/messaging.module.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsService } from "./metrics.service.js";

@Module({
  imports: [MessagingModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
