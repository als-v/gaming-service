import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { NoOpAuthGuard } from "./no-op-auth.guard.js";
import { NoOpProviderIdentityAdapter } from "./no-op-provider-identity.adapter.js";
import { PROVIDER_IDENTITY_PORT } from "./provider-identity.port.js";

@Module({
  providers: [
    { provide: APP_GUARD, useClass: NoOpAuthGuard },
    { provide: PROVIDER_IDENTITY_PORT, useClass: NoOpProviderIdentityAdapter },
  ],
  exports: [PROVIDER_IDENTITY_PORT],
})
export class AuthModule {}
