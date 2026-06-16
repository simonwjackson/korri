import type { ProviderClaim } from "@platform/protocol/acquisition/claim"

export interface ProviderClaimDisplaySummary {
  readonly providerId: string
  readonly id: string
  readonly title: string
  readonly url: string
}

export function providerClaimToDisplaySummary(
  claim: ProviderClaim,
): ProviderClaimDisplaySummary {
  return {
    providerId: claim.providerId,
    id: claim.id,
    title: claim.title,
    url: claim.url,
  }
}
