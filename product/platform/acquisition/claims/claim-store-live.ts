import { makeInMemoryProviderClaimStoreLayer } from "./claim-store"

// Live claims are intentionally cache/state, not authored library data. The
// first live implementation uses the same bounded in-memory service as tests;
// a ProseQL-backed cache can replace this layer without changing acquisition
// callers.
export const makeLiveProviderClaimStoreLayer =
  makeInMemoryProviderClaimStoreLayer
