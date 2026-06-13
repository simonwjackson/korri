import { describe, expect, it } from "bun:test"
import { catalogSnapshotAtom } from "./catalog-atoms"

describe("catalog atoms", () => {
  it("exports the refreshable catalog snapshot atom", () => {
    expect(catalogSnapshotAtom).toBeDefined()
  })
})
