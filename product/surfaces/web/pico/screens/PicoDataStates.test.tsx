import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { PicoDataState } from "./PicoDataState"
import { PicoDataStates } from "./PicoDataStates.page.part"

afterEach(() => cleanup())

describe("PicoDataStates", () => {
  it("derives one entry per PicoDataState case", () => {
    expect(PicoDataStates).toHaveLength(PicoDataState.tags.length)
    expect(PicoDataStates.map(entry => entry.name)).toEqual([
      "Library · Loading",
      "Library · Ready",
      "Library · Load error",
      "Library · Defect",
    ])
  })

  it("renders each data state through the real PicoData seam", () => {
    for (const entry of PicoDataStates) {
      const { unmount } = render(<>{entry.render()}</>)
      unmount()
    }
  })
})
