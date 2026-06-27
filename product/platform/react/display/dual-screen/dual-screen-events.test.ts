import { describe, expect, it } from "bun:test"
import {
  type DualScreenState,
  reduceDualScreenEvent,
} from "./dual-screen-events"

describe("dual-screen events", () => {
  it("accepts a focused game event over no selection", () => {
    const initial: DualScreenState = {
      selectedGameId: null,
      lastSource: null,
      revision: 0,
    }

    expect(
      reduceDualScreenEvent(initial, {
        _tag: "GameFocused",
        gameId: "hollow-knight",
        source: "primary",
        revision: 1,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 1,
    })
  })

  it("ignores stale snapshots so late messages cannot overwrite current focus", () => {
    const current: DualScreenState = {
      selectedGameId: "ember-circuit",
      lastSource: "primary",
      revision: 3,
    }

    expect(
      reduceDualScreenEvent(current, {
        _tag: "SelectionSnapshot",
        selectedGameId: "hollow-knight",
        lastSource: "primary",
        source: "primary",
        revision: 2,
      }),
    ).toBe(current)
  })

  it("applies newer authoritative snapshots", () => {
    const current: DualScreenState = {
      selectedGameId: null,
      lastSource: null,
      revision: 0,
    }

    expect(
      reduceDualScreenEvent(current, {
        _tag: "SelectionSnapshot",
        selectedGameId: "hollow-knight",
        lastSource: "primary",
        source: "primary",
        revision: 4,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 4,
    })
  })
})
