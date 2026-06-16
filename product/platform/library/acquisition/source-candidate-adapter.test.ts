import { describe, expect, it } from "bun:test"
import type { ProviderClaim } from "@platform/protocol/acquisition/claim"
import { providerClaimToDisplaySummary } from "./source-candidate-adapter"

describe("providerClaimToDisplaySummary", () => {
  it("keeps provider claims display-only instead of authoring library items", () => {
    const claim: ProviderClaim = {
      _tag: "ProviderClaim",
      providerId: "@korri:steam",
      id: "downwell",
      title: "Downwell",
      url: "steam://rungameid/360740",
    }

    expect(providerClaimToDisplaySummary(claim)).toEqual({
      providerId: "@korri:steam",
      id: "downwell",
      title: "Downwell",
      url: "steam://rungameid/360740",
    })
  })
})
