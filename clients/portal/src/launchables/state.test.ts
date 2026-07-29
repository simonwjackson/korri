import { describe, expect, it } from "bun:test"
import { LaunchablesState } from "./state"

const localOk = {
  _tag: "Launchables",
  items: [
    { packageName: "a", label: "A" },
    { packageName: "b", label: "B" },
  ],
} as const

const officeHost = { uuid: "h1", name: "Office PC", paired: true } as const

const officeApps = {
  host: officeHost,
  apps: {
    _tag: "StreamApps",
    items: [
      { id: 1, name: "Desktop" },
      { id: 2, name: "Steam" },
    ],
  },
} as const

const ready = LaunchablesState.fromSources(localOk, [officeApps])

describe("LaunchablesState.fromSources", () => {
  it("folds local apps and host stream apps into one ordered entry list", () => {
    expect(ready._tag).toBe("Ready")
    if (ready._tag !== "Ready") throw new Error("unreachable")
    expect(ready.entries.map(e => e.kind)).toEqual([
      "local",
      "local",
      "stream",
      "stream",
    ])
    expect(ready.notice).toBeNull()
  })

  it("degrades failed sources to a notice while entries remain", () => {
    const state = LaunchablesState.fromSources(
      { _tag: "QueryFailed", message: "pm broke" },
      [officeApps],
    )
    expect(state).toMatchObject({
      _tag: "Ready",
      notice: "this device: pm broke",
    })
  })

  it("reports a hosts-query error in the notice", () => {
    const state = LaunchablesState.fromSources(localOk, [], "db locked")
    expect(state).toMatchObject({
      _tag: "Ready",
      notice: "stream hosts: db locked",
    })
  })

  it("is a LoadError only when every source failed", () => {
    const state = LaunchablesState.fromSources(
      { _tag: "QueryFailed", message: "pm broke" },
      [
        {
          host: officeHost,
          apps: { _tag: "QueryFailed", message: "no cache" },
        },
      ],
    )
    expect(state).toEqual({
      _tag: "LoadError",
      message: "this device: pm broke · Office PC: no cache",
    })
  })
})

describe("LaunchablesState selection", () => {
  it("moves across source boundaries as one flat list", () => {
    let state = ready
    state = LaunchablesState.moveSelection(state, "down")
    state = LaunchablesState.moveSelection(state, "down")
    expect(LaunchablesState.selected(state)).toMatchObject({
      _tag: "Some",
      value: { kind: "stream", app: { id: 1 } },
    })
  })

  it("clamps at the ends and ignores horizontal movement", () => {
    expect(LaunchablesState.moveSelection(ready, "up")).toMatchObject({
      selectedIndex: 0,
    })
    expect(LaunchablesState.moveSelection(ready, "left")).toBe(ready)
    const loading = LaunchablesState.loading()
    expect(LaunchablesState.moveSelection(loading, "down")).toBe(loading)
  })
})

describe("LaunchablesState action results", () => {
  it("surfaces launch and stream failures as notices", () => {
    const launchFailed = LaunchablesState.withLaunchResult(ready, {
      _tag: "LaunchFailed",
      reason: "NotFound",
      message: "gone",
    })
    expect(launchFailed).toMatchObject({ notice: "NotFound: gone" })

    const streamFailed = LaunchablesState.withStartStreamResult(ready, {
      _tag: "StreamFailed",
      reason: "NotPaired",
      message: "pair first",
    })
    expect(streamFailed).toMatchObject({ notice: "NotPaired: pair first" })
  })

  it("clears notices on success and on movement", () => {
    const failed = LaunchablesState.withStartStreamResult(ready, {
      _tag: "StreamFailed",
      reason: "HostUnreachable",
      message: "offline",
    })
    expect(
      LaunchablesState.withStartStreamResult(failed, { _tag: "StreamStarted" }),
    ).toMatchObject({ notice: null })
    expect(LaunchablesState.moveSelection(failed, "down")).toMatchObject({
      notice: null,
    })
  })
})

describe("LaunchablesState.sections", () => {
  it("groups the flat list into titled sections preserving indices", () => {
    if (ready._tag !== "Ready") throw new Error("unreachable")
    const sections = LaunchablesState.sections(ready)
    expect(sections.map(s => [s.title, s.startIndex, s.entries.length])).toEqual([
      ["This device", 0, 2],
      ["Office PC", 2, 2],
    ])
  })
})
