import { describe, expect, it } from "bun:test"
import type {
  CatalogSnapshotOutcome,
  LocalGamesListOutcome,
  SessionStatusOutcome,
  SessionStopOutcome,
} from "@contracts/generated/korrid"
import { SessionStopPhase } from "@contracts/generated/korrid"
import { entryKey, LaunchablesState } from "./state"

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

const localGamesOk: LocalGamesListOutcome = {
  _tag: "Ok",
  payload: {
    games: [{ id: "wl4", title: "Wario Land 4", system: "Game Boy Advance" }],
  },
}

const ready = LaunchablesState.fromSources(localOk, [officeApps], gamesOk)

describe("LaunchablesState.fromSources", () => {
  it("folds the local game beside stream catalog entries", () => {
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      undefined,
      localGamesOk,
    )
    if (state._tag !== "Ready") throw new Error("unreachable")
    expect(state.entries.map(entry => entry.kind)).toEqual([
      "local-game",
      "game",
      "game",
      "local",
      "local",
      "stream",
      "stream",
    ])
    expect(state.entries[0]).toMatchObject({
      kind: "local-game",
      game: { id: "wl4", title: "Wario Land 4" },
    })
  })

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

  it("degrades a failed local-game source to a notice while entries remain", () => {
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      undefined,
      {
        _tag: "Err",
        payload: { code: "LocalStorageUnavailable", message: "storage denied" },
      },
    )
    expect(state).toMatchObject({
      _tag: "Ready",
      notice: "local games: LocalStorageUnavailable",
    })
  })

  it("degrades a failed korrid catalog to a notice while entries remain", () => {
    const state = LaunchablesState.fromSources(localOk, [officeApps], gamesErr)
    expect(state).toMatchObject({
      _tag: "Ready",
      notice: "games: UpstreamUnreachable",
    })
  })

  it("surfaces partial host catalog failures while keeping healthy games", () => {
    const state = LaunchablesState.fromSources(localOk, [officeApps], {
      _tag: "Ok",
      payload: {
        games: [{ id: "legacy", title: "Legacy game", host: "aka" }],
        failures: [
          {
            host: "zao",
            code: "UpstreamUnreachable",
            message: "connection refused",
          },
        ],
      },
    })
    expect(state).toMatchObject({
      _tag: "Ready",
      notice: "zao: UpstreamUnreachable",
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

describe("hosted game identity", () => {
  it("qualifies duplicate game ids by host", () => {
    expect(
      [
        entryKey({
          kind: "game",
          game: { id: "shared", title: "Shared", host: "aka" },
        }),
        entryKey({
          kind: "game",
          game: { id: "shared", title: "Shared", host: "zao" },
        }),
      ],
    ).toEqual(["game:aka:shared", "game:zao:shared"])
  })
})

describe("LaunchablesState stream targets", () => {
  const streamSources = [
    {
      host: { uuid: "aka-uuid", name: "aka", paired: true },
      apps: {
        _tag: "StreamApps" as const,
        items: [{ id: 10, name: "Korri Stream" }],
      },
    },
    {
      host: { uuid: "zao-uuid", name: "zao", paired: true },
      apps: {
        _tag: "StreamApps" as const,
        items: [{ id: 20, name: "Korri Stream" }],
      },
    },
  ]

  it("selects the paired stream host named by the game", () => {
    expect(LaunchablesState.korriStreamTarget(streamSources, "zao")).toEqual({
      _tag: "Some",
      value: { hostUuid: "zao-uuid", appId: 20 },
    })
  })

  it("preserves first-match behavior for games without a host", () => {
    expect(LaunchablesState.korriStreamTarget(streamSources)).toEqual({
      _tag: "Some",
      value: { hostUuid: "aka-uuid", appId: 10 },
    })
  })

  it("does not attach to another machine when the named host is absent", () => {
    expect(LaunchablesState.korriStreamTarget(streamSources, "sobo")).toEqual({
      _tag: "None",
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

  it("locks selection while any asynchronous launch is in flight", () => {
    const launching = LaunchablesState.beginLaunching(ready, "Desktop")
    expect(launching).toMatchObject({ _tag: "Launching", title: "Desktop" })
    expect(LaunchablesState.selected(launching)).toEqual({ _tag: "None" })
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
  it("surfaces local brain and native launch failures as notices", () => {
    const launching = LaunchablesState.beginLaunching(ready, "Wario Land 4")
    expect(
      LaunchablesState.withLocalLaunchOutcome(launching, {
        _tag: "Err",
        payload: { code: "LocalRomMissing", message: "ROM absent" },
      }),
    ).toMatchObject({ _tag: "Ready", notice: "LocalRomMissing: ROM absent" })
    expect(
      LaunchablesState.withLocalLaunchResult(launching, {
        _tag: "LaunchFailed",
        reason: "NotInstalled",
        message: "RetroArch absent",
      }),
    ).toMatchObject({
      _tag: "Ready",
      notice: "NotInstalled: RetroArch absent",
    })
  })

  it("surfaces launch, stream, and prepare failures as notices", () => {
    const launchFailed = LaunchablesState.withLaunchResult(
      LaunchablesState.beginLaunching(ready, "A"),
      {
      _tag: "LaunchFailed",
      reason: "NotFound",
      message: "gone",
      },
    )
    expect(launchFailed).toMatchObject({ notice: "NotFound: gone" })

    const streamFailed = LaunchablesState.withStartStreamResult(
      LaunchablesState.beginLaunching(ready, "Desktop"),
      {
      _tag: "StreamFailed",
      reason: "NotPaired",
      message: "pair first",
      },
    )
    expect(streamFailed).toMatchObject({ notice: "NotPaired: pair first" })

    const prepareFailed = LaunchablesState.withPrepareOutcome(
      LaunchablesState.beginPreparing(ready, "Skate 3"),
      {
      _tag: "Err",
      payload: { code: "UpstreamFailure", message: "no such game" },
      },
    )
    expect(prepareFailed).toMatchObject({
      notice: "UpstreamFailure: no such game",
    })
  })

  it("clears notices on success and on movement", () => {
    const failed = LaunchablesState.withStartStreamResult(
      LaunchablesState.beginLaunching(ready, "Desktop"),
      {
      _tag: "StreamFailed",
      reason: "HostUnreachable",
      message: "offline",
      },
    )
    const launching = LaunchablesState.beginLaunching(ready, "Desktop")
    expect(
      LaunchablesState.withStartStreamResult(launching, {
        _tag: "StreamStarted",
      }),
    ).toMatchObject({ _tag: "Launching", notice: null })
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    expect(
      LaunchablesState.withPrepareOutcome(preparing, {
        _tag: "Ok",
        payload: { gameId: "skate3" },
      }),
    ).toMatchObject({ _tag: "Preparing", notice: null })
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

  it("stop Ok enters an input-locked stopping case until status is idle", () => {
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
    const stopRequested = LaunchablesState.beginStopping(withBanner)
    expect(stopRequested._tag).toBe("Stopping")
    expect(LaunchablesState.selected(stopRequested)).toEqual({ _tag: "None" })
    const stopping = LaunchablesState.withStopOutcome(stopRequested, ok)
    expect(stopping._tag).toBe("Stopping")
    expect(LaunchablesState.selected(stopping)).toEqual({ _tag: "None" })

    const stillActive = LaunchablesState.withStatusAfterStop(
      stopping,
      sessionActive,
    )
    expect(stillActive._tag).toBe("Stopping")

    const stopped = LaunchablesState.withStatusAfterStop(stillActive, sessionIdle)
    if (stopped._tag !== "Ready") throw new Error("unreachable")
    expect(stopped.entries.every(entry => entry.kind !== "now-playing")).toBe(true)

    const replacementSession: SessionStatusOutcome = {
      _tag: "Ok",
      payload: {
        active: { launchId: "l2", title: "Different game" },
      },
    }
    expect(
      LaunchablesState.withStatusAfterStop(stopping, replacementSession)._tag,
    ).toBe("Ready")

    const failed = LaunchablesState.withStopOutcome(stopRequested, {
      _tag: "Err",
      payload: { code: "HostUnavailable", message: "host is unavailable" },
    })
    if (failed._tag !== "Ready") throw new Error("unreachable")
    expect(failed.notice).toBe("HostUnavailable: host is unavailable")
  })

  it("returns to the list with a truthful notice when pending stop times out", () => {
    const withBanner = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      sessionActive,
    )
    const stopping = LaunchablesState.withStopOutcome(
      LaunchablesState.beginStopping(withBanner),
      {
      _tag: "Ok",
      payload: { phase: SessionStopPhase.Pending },
      },
    )
    const timedOut = LaunchablesState.stopTimedOut(stopping)
    expect(timedOut).toMatchObject({
      _tag: "Ready",
      notice: "StopPending: session is still stopping",
    })
  })
})

describe("LaunchablesState preparing", () => {
  it("confirm on a game enters an explicit input-locked Preparing case", () => {
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    if (preparing._tag !== "Preparing") throw new Error("unreachable")
    expect(preparing.title).toBe("Skate 3")
    expect(LaunchablesState.selected(preparing)).toEqual({ _tag: "None" })
  })

  it("prepare Err restores the list with a notice", () => {
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    const failed = LaunchablesState.withPrepareOutcome(preparing, {
      _tag: "Err",
      payload: { code: "UpstreamUnreachable", message: "host offline" },
    })
    if (failed._tag !== "Ready") throw new Error("unreachable")
    expect(failed.notice).toBe("UpstreamUnreachable: host offline")
  })

  it("prepare Ok keeps preparing visible until the activity swap", () => {
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    const prepared = LaunchablesState.withPrepareOutcome(preparing, {
      _tag: "Ok",
      payload: { gameId: "skate3" },
    })
    if (prepared._tag !== "Preparing") throw new Error("unreachable")
    expect(prepared.title).toBe("Skate 3")
  })

  it("a stream start failure clears preparing with a notice", () => {
    const preparing = LaunchablesState.beginPreparing(ready, "Skate 3")
    const failed = LaunchablesState.withStartStreamResult(preparing, {
      _tag: "StreamFailed",
      reason: "HostUnreachable",
      message: "no route",
    })
    if (failed._tag !== "Ready") throw new Error("unreachable")
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

describe("storage access prompt", () => {
  const denied = { _tag: "Denied" } as const

  it("puts a focusable prompt first when file access is denied", () => {
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      undefined,
      undefined,
      denied,
    )
    if (state._tag !== "Ready") throw new Error("unreachable")
    expect(state.entries[0]).toEqual({ kind: "storage-access" })
    // It must be reachable by controller, so it takes the initial selection.
    expect(state.selectedIndex).toBe(0)
    expect(LaunchablesState.sections(state)[0]?.title).toBe("Needs your attention")
  })

  it("shows nothing when access is granted", () => {
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      undefined,
      undefined,
      { _tag: "Granted" },
    )
    if (state._tag !== "Ready") throw new Error("unreachable")
    expect(state.entries.some(entry => entry.kind === "storage-access")).toBe(false)
  })

  it("shows nothing on a platform where access is not a concept", () => {
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      undefined,
      undefined,
      { _tag: "NotRequired" },
    )
    if (state._tag !== "Ready") throw new Error("unreachable")
    expect(state.entries.some(entry => entry.kind === "storage-access")).toBe(false)
  })

  it("does not nag when the check itself failed", () => {
    // An inconclusive answer is not a denial: prompting on a failed query
    // would badger users whose permission is actually fine.
    const state = LaunchablesState.fromSources(
      localOk,
      [officeApps],
      gamesOk,
      undefined,
      undefined,
      undefined,
      { _tag: "QueryFailed", message: "boom" },
    )
    if (state._tag !== "Ready") throw new Error("unreachable")
    expect(state.entries.some(entry => entry.kind === "storage-access")).toBe(false)
  })

  it("keeps a stable key so the prompt does not remount on refresh", () => {
    expect(entryKey({ kind: "storage-access" })).toBe("storage-access")
  })
})

describe("LaunchablesState.selectIndex", () => {
  it("moves selection to the tapped entry", () => {
    if (ready._tag !== "Ready") throw new Error("unreachable")
    const next = LaunchablesState.selectIndex(ready, 3)
    if (next._tag !== "Ready") throw new Error("unreachable")
    expect(next.selectedIndex).toBe(3)
  })

  it("ignores a stale index rather than activating a neighbour", () => {
    // A list that changed under the user must not launch the wrong thing.
    if (ready._tag !== "Ready") throw new Error("unreachable")
    expect(LaunchablesState.selectIndex(ready, 99)).toBe(ready)
    expect(LaunchablesState.selectIndex(ready, -1)).toBe(ready)
  })

  it("clears a stale notice when selection moves", () => {
    if (ready._tag !== "Ready") throw new Error("unreachable")
    const withNotice = LaunchablesState.withNotice(ready, "old failure")
    const next = LaunchablesState.selectIndex(withNotice, 2)
    if (next._tag !== "Ready") throw new Error("unreachable")
    expect(next.notice).toBeNull()
  })
})
