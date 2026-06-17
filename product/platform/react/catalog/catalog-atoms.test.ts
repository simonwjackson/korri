import { describe, expect, it } from "bun:test"
import { Duration } from "effect"
import {
  CATALOG_SNAPSHOT_REFRESH_INTERVAL,
  catalogSnapshotAtom,
} from "./catalog-atoms"

describe("catalog atoms", () => {
  it("exports the refreshable catalog snapshot atom", () => {
    expect(catalogSnapshotAtom).toBeDefined()
  })

  it("keeps automatic catalog refresh slower than device catalog reads", () => {
    expect(Duration.toMillis(CATALOG_SNAPSHOT_REFRESH_INTERVAL)).toBe(60_000)
  })
})
