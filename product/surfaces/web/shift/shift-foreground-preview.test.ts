import { afterEach, describe, expect, it } from "bun:test"
import {
  FOREGROUND_SESSION_GATE_STATE_TAGS,
  foregroundStateSamples,
  getShiftForegroundPreview,
  setShiftForegroundPreview,
} from "./shift-foreground-preview"

afterEach(() => setShiftForegroundPreview(null))

describe("shift foreground preview", () => {
  it("sets, reads, and clears the foreground preview singleton", () => {
    const recovering = foregroundStateSamples.Recovering()
    setShiftForegroundPreview(recovering)
    expect(getShiftForegroundPreview()).toEqual(recovering)
    setShiftForegroundPreview(null)
    expect(getShiftForegroundPreview()).toBeNull()
  })

  it("has a representative sample for every foreground gate tag", () => {
    expect(FOREGROUND_SESSION_GATE_STATE_TAGS).toEqual([
      "Ready",
      "Preparing",
      "Running",
      "Cooling",
      "Recovering",
      "Unknown",
      "LoadError",
    ])
    expect(
      FOREGROUND_SESSION_GATE_STATE_TAGS.map(
        tag => foregroundStateSamples[tag]()._tag,
      ),
    ).toEqual([...FOREGROUND_SESSION_GATE_STATE_TAGS])
  })
})
