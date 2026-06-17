import { describe, expect, it } from "bun:test"
import { normalizeGamescopeState } from "./state-normalizer"

describe("gamescope stream-control state normalizer", () => {
  it("normalizes GameScope state while dropping unknown filters", () => {
    expect(
      normalizeGamescopeState({
        result: {
          fps: 60,
          xwaylandMode: { width: 1280, height: 720 },
          sharpness: 8,
          filter: "fsr",
        },
      }),
    ).toEqual({
      fps: 60,
      resolution: { width: 1280, height: 720 },
      sharpness: 8,
      filter: "fsr",
    })

    expect(
      normalizeGamescopeState({ result: { filter: "future-filter" } }),
    ).toEqual({
      fps: null,
      resolution: null,
      sharpness: null,
      filter: null,
    })
  })
})
