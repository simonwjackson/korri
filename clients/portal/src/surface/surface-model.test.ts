import { describe, expect, test } from "bun:test"
import { LaunchablesState, type PortalEntry } from "../launchables/state"
import {
  entryForId,
  gameActionsForEntry,
  surfaceModelFrom,
} from "./surface-model"

const ready = (
  entries: readonly PortalEntry[],
  notice: string | null = null,
): LaunchablesState => ({
  _tag: "Ready",
  entries,
  notice,
})

const localGame: PortalEntry = {
  kind: "local-game",
  game: { id: "wl4", title: "Wario Land 4", system: "GBA" },
}
const hostGame: PortalEntry = {
  kind: "game",
  game: { id: "neverball", title: "Neverball", host: "zao" },
}
const nowPlaying: PortalEntry = {
  kind: "now-playing",
  session: { launchId: "L1", title: "Skate 3", host: "aka" },
}

describe("surfaceModelFrom", () => {
  test("publishes only playable things as games", () => {
    const model = surfaceModelFrom(
      ready([{ kind: "pairing" }, localGame, hostGame]),
    )

    expect(model.catalog._tag).toBe("Ready")
    if (model.catalog._tag !== "Ready") return
    expect(model.catalog.games.map(game => game.title)).toEqual([
      "Wario Land 4",
      "Neverball",
    ])
  })

  test("groups games by where they can be played", () => {
    const model = surfaceModelFrom(ready([nowPlaying, localGame, hostGame]))

    if (model.catalog._tag !== "Ready") throw new Error("expected Ready")
    expect(model.catalog.games.map(game => game.section)).toEqual([
      "Continue",
      "This device",
      "zao",
    ])
  })

  test("never invents art or metadata korrid does not have", () => {
    const model = surfaceModelFrom(ready([localGame]))

    if (model.catalog._tag !== "Ready") throw new Error("expected Ready")
    const game = model.catalog.games[0]!
    expect(game.coverArtUrl).toBeUndefined()
    expect(game.wideArtUrl).toBeUndefined()
    expect(game.subtitle).toBe("GBA")
  })

  test("reports retained host copies without adding another game", () => {
    const model = surfaceModelFrom(
      ready([
        {
          ...localGame,
          alternatives: [
            {
              kind: "remote",
              game: { id: "wl4", title: "Wario Land 4", host: "zao" },
            },
          ],
        },
      ]),
    )

    if (model.catalog._tag !== "Ready") throw new Error("expected Ready")
    expect(model.catalog.games).toHaveLength(1)
    expect(model.catalog.games[0]?.subtitle).toBe("GBA · Also on zao")
  })

  test("the running session is resumable and leads the catalog", () => {
    const model = surfaceModelFrom(ready([nowPlaying, localGame]))

    if (model.catalog._tag !== "Ready") throw new Error("expected Ready")
    expect(model.catalog.games[0]).toMatchObject({
      title: "Skate 3",
      resumable: true,
    })
  })

  test("setup entries become rail actions, not games", () => {
    const model = surfaceModelFrom(
      ready([
        { kind: "storage-access" },
        { kind: "pairing" },
        { kind: "background-notice", visible: false },
      ]),
    )

    expect(model.catalog._tag).toBe("Empty")
    expect(model.actions.map(action => action.label)).toEqual([
      "Allow file access",
      "Pair a device",
      "Show Korri running",
    ])
    expect(model.actions.every(action => action.enabled)).toBe(true)
  })

  test("a notice becomes a problem the user acknowledges", () => {
    const model = surfaceModelFrom(ready([localGame], "local ROM is missing"))

    expect(model.status).toEqual({
      _tag: "Problem",
      kicker: "Couldn't start",
      reason: "local ROM is missing",
      canRetry: false,
    })
  })

  test("in-flight work is busy, never an error", () => {
    const preparing = LaunchablesState.beginPreparing(
      ready([hostGame]),
      "Neverball",
    )
    const model = surfaceModelFrom(preparing)

    expect(model.status._tag).toBe("Busy")
    if (model.status._tag !== "Busy") return
    expect(model.status.kicker).toContain("Neverball")
  })

  test("loading reports loading rather than an empty library", () => {
    const model = surfaceModelFrom(LaunchablesState.loading())

    expect(model.catalog._tag).toBe("Loading")
    expect(model.actions).toEqual([])
    expect(model.status._tag).toBe("Browsing")
  })

  test("the clock is only published when the host has one", () => {
    expect(surfaceModelFrom(ready([localGame])).clockLabel).toBeUndefined()
    expect(
      surfaceModelFrom(ready([localGame]), { clockLabel: "4:24 PM" })
        .clockLabel,
    ).toBe("4:24 PM")
  })
})

describe("game actions", () => {
  test("only the running session has actions today", () => {
    expect(gameActionsForEntry(localGame)).toEqual([])
    expect(gameActionsForEntry(hostGame)).toEqual([])
    expect(gameActionsForEntry(nowPlaying).map(action => action.id)).toEqual([
      "resume",
      "stop",
    ])
  })

  test("stopping is marked destructive", () => {
    const stop = gameActionsForEntry(nowPlaying).find(
      action => action.id === "stop",
    )
    expect(stop?.destructive).toBe(true)
  })
})

describe("entryForId", () => {
  test("surface ids round-trip back to the entry they came from", () => {
    const state = ready([localGame, hostGame, nowPlaying])
    const model = surfaceModelFrom(state)

    if (model.catalog._tag !== "Ready") throw new Error("expected Ready")
    for (const game of model.catalog.games) {
      expect(entryForId(state, game.id)).toBeDefined()
    }
    for (const action of model.actions) {
      expect(entryForId(state, action.id)).toBeDefined()
    }
  })

  test("an unknown id resolves to nothing rather than the wrong entry", () => {
    expect(entryForId(ready([localGame]), "local-game:missing")).toBeUndefined()
    expect(entryForId(LaunchablesState.loading(), "anything")).toBeUndefined()
  })
})
