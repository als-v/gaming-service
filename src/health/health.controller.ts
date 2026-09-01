import { Controller, Get, HttpCode } from "@nestjs/common";

interface HealthResponse {
  status: "ok";
}

@Controller("health")
export class HealthController {
  @Get("live")
  @HttpCode(200)
  live(): HealthResponse {
    return { status: "ok" };
  }

  @Get("ready")
  @HttpCode(200)
  ready(): HealthResponse {
    return { status: "ok" };
  }
}
