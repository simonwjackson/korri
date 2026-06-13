import { describe, expect, it } from "bun:test"
import { libraryItemsAtom } from "./library-atoms"

describe("library atoms", () => {
  it("exports the refreshable library items atom used by Shift", () => {
    expect(libraryItemsAtom).toBeDefined()
  })
})
