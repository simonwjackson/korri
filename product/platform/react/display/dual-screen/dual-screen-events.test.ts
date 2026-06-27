import { describe, expect, it } from "bun:test"
import {
  type DualScreenState,
  reduceDualScreenEvent,
} from "./dual-screen-events"

const primaryA = "primary:a"
const primaryB = "primary:b"

function state(overrides: Partial<DualScreenState> = {}): DualScreenState {
  return {
    selectedGameId: null,
    lastSource: null,
    revision: 0,
    revisionSourceId: null,
    supersededRevisionSourceIds: [],
    ...overrides,
  }
}

describe("dual-screen events", () => {
  it("accepts a focused game event over no selection", () => {
    expect(
      reduceDualScreenEvent(state(), {
        _tag: "GameFocused",
        gameId: "hollow-knight",
        source: "primary",
        revision: 1,
        revisionSourceId: primaryA,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 1,
      revisionSourceId: primaryA,
      supersededRevisionSourceIds: [],
    })
  })

  it("ignores stale snapshots from the same revision source", () => {
    const current = state({
      selectedGameId: "ember-circuit",
      lastSource: "primary",
      revision: 3,
      revisionSourceId: primaryA,
    })

    expect(
      reduceDualScreenEvent(current, {
        _tag: "SelectionSnapshot",
        selectedGameId: "hollow-knight",
        lastSource: "primary",
        source: "primary",
        revision: 2,
        revisionSourceId: primaryA,
      }),
    ).toEqual(current)
  })

  it("applies newer authoritative snapshots", () => {
    expect(
      reduceDualScreenEvent(state(), {
        _tag: "SelectionSnapshot",
        selectedGameId: "hollow-knight",
        lastSource: "primary",
        source: "primary",
        revision: 4,
        revisionSourceId: primaryA,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 4,
      revisionSourceId: primaryA,
      supersededRevisionSourceIds: [],
    })
  })

  it("accepts a restarted primary whose counter begins below the old primary", () => {
    const current = state({
      selectedGameId: "ember-circuit",
      lastSource: "primary",
      revision: 12,
      revisionSourceId: primaryA,
    })

    expect(
      reduceDualScreenEvent(current, {
        _tag: "GameFocused",
        gameId: "hollow-knight",
        source: "primary",
        revision: 1,
        revisionSourceId: primaryB,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 1,
      revisionSourceId: primaryB,
      supersededRevisionSourceIds: [primaryA],
    })
  })

  it("rejects delayed events from a superseded primary", () => {
    const current = state({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 1,
      revisionSourceId: primaryB,
      supersededRevisionSourceIds: [primaryA],
    })

    expect(
      reduceDualScreenEvent(current, {
        _tag: "GameFocused",
        gameId: "ember-circuit",
        source: "primary",
        revision: 99,
        revisionSourceId: primaryA,
      }),
    ).toEqual(current)
  })

  it("accepts legacy state objects without revision-source tracking", () => {
    const legacyState = {
      selectedGameId: null,
      lastSource: null,
      revision: 0,
    }

    expect(
      reduceDualScreenEvent(legacyState, {
        _tag: "GameFocused",
        gameId: "hollow-knight",
        source: "primary",
        revision: 1,
        revisionSourceId: primaryA,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 1,
      revisionSourceId: primaryA,
      supersededRevisionSourceIds: [],
    })
  })

  it("normalizes legacy focus events without a revision source", () => {
    expect(
      reduceDualScreenEvent(state(), {
        _tag: "GameFocused",
        gameId: "hollow-knight",
        source: "primary",
        revision: 1,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 1,
      revisionSourceId: "legacy:primary",
      supersededRevisionSourceIds: [],
    })
  })

  it("rejects legacy focus after a modern primary has authority", () => {
    const current = state({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 1,
      revisionSourceId: primaryB,
    })

    expect(
      reduceDualScreenEvent(current, {
        _tag: "GameFocused",
        gameId: "ember-circuit",
        source: "primary",
        revision: 1,
      }),
    ).toEqual(current)
  })

  it("merges superseded ids from authoritative snapshots", () => {
    expect(
      reduceDualScreenEvent(state(), {
        _tag: "SelectionSnapshot",
        selectedGameId: "hollow-knight",
        lastSource: "primary",
        source: "primary",
        revision: 2,
        revisionSourceId: primaryB,
        supersededRevisionSourceIds: [primaryA],
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 2,
      revisionSourceId: primaryB,
      supersededRevisionSourceIds: [primaryA],
    })
  })

  it("keeps empty primary snapshots source-less before the first focus", () => {
    const afterEmptySnapshot = reduceDualScreenEvent(state(), {
      _tag: "SelectionSnapshot",
      selectedGameId: null,
      lastSource: null,
      source: "primary",
      revision: 0,
      revisionSourceId: null,
    })

    expect(
      reduceDualScreenEvent(afterEmptySnapshot, {
        _tag: "GameFocused",
        gameId: "hollow-knight",
        source: "primary",
        revision: 1,
        revisionSourceId: primaryB,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 1,
      revisionSourceId: primaryB,
      supersededRevisionSourceIds: [],
    })
  })

  it("accepts newer primary snapshots over companion-owned seed state", () => {
    const companionSeed = state({
      selectedGameId: "ember-circuit",
      lastSource: "companion",
      revision: 1,
      revisionSourceId: "companion:seed",
    })

    expect(
      reduceDualScreenEvent(companionSeed, {
        _tag: "SelectionSnapshot",
        selectedGameId: "hollow-knight",
        lastSource: "primary",
        source: "primary",
        revision: 2,
        revisionSourceId: primaryB,
      }),
    ).toEqual({
      selectedGameId: "hollow-knight",
      lastSource: "primary",
      revision: 2,
      revisionSourceId: primaryB,
      supersededRevisionSourceIds: ["companion:seed"],
    })
  })

  it("does not let companion snapshots overwrite the authoritative primary state", () => {
    const current = state({
      selectedGameId: "ember-circuit",
      lastSource: "primary",
      revision: 3,
      revisionSourceId: primaryA,
    })

    expect(
      reduceDualScreenEvent(current, {
        _tag: "SelectionSnapshot",
        selectedGameId: null,
        lastSource: null,
        source: "companion",
        revision: 100,
        revisionSourceId: "companion:a",
      }),
    ).toBe(current)
  })
})
