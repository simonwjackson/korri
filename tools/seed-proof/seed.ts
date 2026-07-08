/**
 * Seed-proof — the in-memory ProseQL seed + atom initial values that swap the
 * live RPC layers for it. Shared with the multi-device lab so both harnesses
 * click through the same real Shift seed.
 */
export {
  makeSeedInitialValues,
  SEED_ENTRY_SOURCE,
  type SeedInitialValues,
} from "../lab/seed/shift-seed"
