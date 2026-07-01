import { describe, expect, it } from "bun:test"
import { deviceFactsSourceLayerAtom, deviceStateAtom } from "./device-atoms"

describe("device atoms", () => {
  it("exports device state and source layer atoms", () => {
    expect(deviceStateAtom).toBeDefined()
    expect(deviceFactsSourceLayerAtom).toBeDefined()
  })
})
