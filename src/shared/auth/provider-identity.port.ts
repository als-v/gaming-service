export interface ProviderIdentityPort {
  currentProviderId(): string | undefined;
}

export const PROVIDER_IDENTITY_PORT = Symbol("PROVIDER_IDENTITY_PORT");
