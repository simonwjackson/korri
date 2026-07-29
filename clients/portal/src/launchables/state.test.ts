import { describe, expect, it } from "bun:test"
import type {
  CatalogSnapshotOutcome,
  SessionStatusOutcome,
  SessionStopOutcome,
} from "@contracts/generated/korrid"
import { SessionStopPhase } from "@contracts/generated/korrid"
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

const gamesOk: CatalogSnapshotOutcome = {
  _tag: "Ok",
  payload: {
    games: [
      { id: "skate3", title: "Skate 3" },
      { id: "neverball", title: "Neverball" },
    ],
  },
}

const gamesErr: CatalogSnapshotOutcome = {
  _tag: "Err",
  payload: { code: "UpstreamUnreachable", message: "host offline" },
}

const ready = LaunchablesState.fromSources(localOk, [officeApps], gamesOk)

describe("LaunchablesState.fromSources", () => {
  it("folds korrid games, local apps, and stream apps into one ordered list", () => {
    expect(ready._tag).toBe("Ready")
    if (ready._tag !== "Ready") throw new Error("unreachable")
    expect(ready.entries.map(e => e.kind)).toEqual([
      "game",
      "game",
      "local",
      "local",
      "stream",
      "stream",
    ])
    expect(ready.notice).toBeNull()
  })

  it("degrades a failed korrid catalog to a notice while entries remain", () => {
    const state = LaunchablesState.fromSources(localOk, [officeApps], gamesErr)
    expect(state).toMatchObject({
      _tag: "Ready",
      notice: "games: UpstreamUnreachable",
    })
  })

  it("degrades failed sources to a notice while entries remain", () => {
    const state = LaunchablesState.fromSources(
      { _tag: "QueryFailed", message: "pm broke" },
      [officeApps],
      gamesOk,
    )
    expect(state).toMatchObject({
      _tag: "Ready",
      notice: "this device: pm broke",
    })
  })

  it("reports a hosts-query error in the notice", () => {
    const state = LaunchablesState.fromSources(localOk, [], gamesOk, "db locked")
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
      gamesErr,
    )
    expect(state).toEqual({
      _tag: "LoadError",
      message:
        "games: UpstreamUnreachable · this device: pm broke · Office PC: no cache",
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
      value: { kind: "local", launchable: { packageName: "a" } },
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
  it("surfaces launch, stream, and prepare failures as notices", () => {
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

    const prepareFailed = LaunchablesState.withPrepareOutcome(ready, {
      _tag: "Err",
      payload: { code: "UpstreamFailure", message: "no such game" },
    })
    expect(prepareFailed).toMatchObject({
      notice: "UpstreamFailure: no such game",
    })
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
    expect(
      LaunchablesState.withPrepareOutcome(failed, {
        _tag: "Ok",
        payload: { gameId: "skate3" },
      }),
    ).toMatchObject({ notice: null })
    expect(LaunchablesState.moveSelection(failed, "down")).toMatchObject({
      notice: null,
    })
  })
})

const sessionActive: SessionStatusOutcome = {
  _tag: "Ok",
  payload: {
    active: { launchId: "l1", gameId: "skate3", title: "Skate 3", phase: "running" },
  },
}

const sessionIdle: SessionStatusOutcome = { _tag: "Ok", payload: {} }

const sessionErr: SessionStatusOutcome = {
  _tag: "Err",
  payload: { code: "HostUnavailable", message: "host is unavailable" },
}

describe("LaunchablesState now playing", () => {
  it("renders an active session as a selectable banner entry first", () => {
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      sessionActive,
    )
    if (state._tag !== "Ready") throw new Error("unreachable")
    expect(state.entries[0]).toEqual({
      kind: "now-playing",
      session: {
        launchId: "l1",
        gameId: "skate3",
        title: "Skate 3",
        phase: "running",
      },
    })
    expect(state.selectedIndex).toBe(0)
    const selected = LaunchablesState.selected(state)
    expect(selected._tag).toBe("Some")
  })

  it("shows no banner when nothing is playing", () => {
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      sessionIdle,
    )
    if (state._tag !== "Ready") throw new Error("unreachable")
    expect(state.entries.every(entry => entry.kind !== "now-playing")).toBe(true)
  })

  it("degrades a status failure silently: no banner, no notice", () => {
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      sessionErr,
    )
    if (state._tag !== "Ready") throw new Error("unreachable")
    expect(state.entries.every(entry => entry.kind !== "now-playing")).toBe(true)
    expect(state.notice).toBeNull()
  })

  it("stop Ok clears any notice; stop failure surfaces as a notice", () => {
    const withBanner = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      sessionActive,
    )
    const ok: SessionStopOutcome = {
      _tag: "Ok",
      payload: { phase: SessionStopPhase.Stopped },
    }
    const stopped = LaunchablesState.withStopOutcome(withBanner, ok)
    if (stopped._tag !== "Ready") throw new Error("unreachable")
    expect(stopped.notice).toBeNull()

    const failed = LaunchablesState.withStopOutcome(withBanner, {
      _tag: "Err",
      payload: { code: "HostUnavailable", message: "host is unavailable" },
    })
    if (failed._tag !== "Ready") throw new Error("unreachable")
    expect(failed.notice).toBe("HostUnavailable: host is unavailable")
  })
})

describe("LaunchablesState preparing", () => {
  it("confirm on a game enters a visible preparing state", () => {
    if (ready._tag !== "Ready") throw new Error("unreachable")
    expect(ready.preparing).toBeNull()
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    if (preparing._tag !== "Ready") throw new Error("unreachable")
    expect(preparing.preparing).toBe("Skate 3")
  })

  it("prepare Err restores the list with a notice", () => {
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    const failed = LaunchablesState.withPrepareOutcome(preparing, {
      _tag: "Err",
      payload: { code: "UpstreamUnreachable", message: "host offline" },
    })
    if (failed._tag !== "Ready") throw new Error("unreachable")
    expect(failed.preparing).toBeNull()
    expect(failed.notice).toBe("UpstreamUnreachable: host offline")
  })

  it("prepare Ok keeps preparing visible until the activity swap", () => {
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    const prepared = LaunchablesState.withPrepareOutcome(preparing, {
      _tag: "Ok",
      payload: { gameId: "skate3" },
    })
    if (prepared._tag !== "Ready") throw new Error("unreachable")
    expect(prepared.preparing).toBe("Skate 3")
  })

  it("a stream start failure clears preparing with a notice", () => {
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    const failed = LaunchablesState.withStartStreamResult(preparing, {
      _tag: "StreamFailed",
      reason: "HostUnreachable",
      message: "no route",
    })
    if (failed._tag !== "Ready") throw new Error("unreachable")
    expect(failed.preparing).toBeNull()
    expect(failed.notice).toBe("HostUnreachable: no route")
  })
})

describe("LaunchablesState.sections", () => {
  it("groups the flat list into titled sections preserving indices", () => {
    if (ready._tag !== "Ready") throw new Error("unreachable")
    const sections = LaunchablesState.sections(ready)
    expect(sections.map(s => [s.title, s.startIndex, s.entries.length])).toEqual([
      ["Games", 0, 2],
      ["This device", 2, 2],
      ["Office PC", 4, 2],
    ])
  })
})
