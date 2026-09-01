import { Injectable } from "@nestjs/common";

import type { ProviderIdentityPort } from "./provider-identity.port.js";

@Injectable()
export class NoOpProviderIdentityAdapter implements ProviderIdentityPort {
  currentProviderId(): string | undefined {
    return undefined;
  }
}
