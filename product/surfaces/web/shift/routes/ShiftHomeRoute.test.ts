import { describe, expect, it, mock } from "bun:test"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import { LaunchState } from "@platform/library/launch-state"
import { launchFailureExitCode } from "@platform/library/launcher"
import {
  makeLaunchHandler,
  shiftLaunchStateForForeground,
  toCinematicGame,
  visibleShiftLaunchState,
} from "./ShiftHomeRoute"

function entry(id: string): CatalogEntry {
  return {
    id,
    itemId: id,
    title: id,
    releases: [{ id: "default", system: "steam", launchable: true }],
    launchable: true,
    source: {
      hostId: "local",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  } satisfies CatalogEntry
}

describe("shiftLaunchStateForForeground", () => {
  it("leaves launch state alone when the foreground gate is ready", () => {
    const launching = LaunchState.launching("hollow-knight")
    expect(
      shiftLaunchStateForForeground({
        launch: launching,
        foreground: { _tag: "Ready" },
      }),
    ).toBe(launching)
  })

  it("maps a blocked foreground gate to visible busy feedback", () => {
    expect(
      shiftLaunchStateForForeground({
        launch: LaunchState.idle,
        foreground: { _tag: "Cooling", state: "VerifyingReady" },
      }),
    ).toMatchObject({
      _tag: "Failed",
      failureKind: "session-busy",
      exitCode: launchFailureExitCode("session-busy"),
    })
  })

  it("lets foreground busy feedback override retryable failure feedback", () => {
    expect(
      shiftLaunchStateForForeground({
        launch: {
          _tag: "Failed",
          gameId: "game-1",
          exitCode: 1,
          failureKind: "command-failed",
        },
        foreground: {
          _tag: "Running",
          requestId: "req-1",
          gameId: "game-1",
        },
      }),
    ).toMatchObject({
      _tag: "Failed",
      failureKind: "session-busy",
      exitCode: launchFailureExitCode("session-busy"),
    })
  })

  it("lets foreground busy feedback override release selection feedback", () => {
    expect(
      shiftLaunchStateForForeground({
        launch: {
          _tag: "ReleaseSelectionRequired",
          gameId: "game-1",
          releaseIds: ["a", "b"],
        },
        foreground: {
          _tag: "Running",
          requestId: "req-1",
          gameId: "other-game",
        },
      }),
    ).toMatchObject({
      _tag: "Failed",
      failureKind: "session-busy",
      exitCode: launchFailureExitCode("session-busy"),
    })
  })

  it("leaves launch state alone when foreground status is unavailable", () => {
    expect(
      shiftLaunchStateForForeground({
        launch: LaunchState.idle,
        foreground: { _tag: "LoadError", message: "HTTP 500" },
      })._tag,
    ).toBe("Idle")
  })

  it("preserves successful launch feedback while foreground is running", () => {
    expect(
      shiftLaunchStateForForeground({
        launch: { _tag: "Launched", gameId: "game-1" },
        foreground: {
          _tag: "Running",
          requestId: "req-1",
          gameId: "game-1",
        },
      })._tag,
    ).toBe("Launched")
  })
})

describe("visibleShiftLaunchState", () => {
  it("does not let dismiss hide an active foreground block", () => {
    const visible = visibleShiftLaunchState({
      launch: LaunchState.idle,
      foreground: {
        _tag: "Running",
        requestId: "req-1",
        gameId: "game-1",
      },
      acked: true,
    })
    expect(visible._tag).toBe("Failed")
  })

  it("still lets dismiss hide ordinary launch feedback", () => {
    const visible = visibleShiftLaunchState({
      launch: {
        _tag: "Failed",
        gameId: "game-1",
        exitCode: 1,
      },
      foreground: { _tag: "Ready" },
      acked: true,
    })
    expect(visible._tag).toBe("Idle")
  })
})

describe("makeLaunchHandler", () => {
  it("launches the catalog entry matching the focused id", () => {
    const start = mock((_: CatalogEntry) => undefined)
    const hollow = entry("hollow-knight")
    makeLaunchHandler([entry("celeste"), hollow], start)("hollow-knight")

    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0]?.[0]).toBe(hollow)
  })

  it("ignores ids with no matching catalog entry", () => {
    const start = mock((_: CatalogEntry) => undefined)
    makeLaunchHandler([entry("celeste")], start)("missing")

    expect(start).not.toHaveBeenCalled()
  })
})

describe("toCinematicGame", () => {
  it("maps catalog metadata and user data into cinematic chip fields", () => {
    const game = toCinematicGame({
      id: "hollow-knight",
      itemId: "hollow-knight",
      title: "Hollow Knight",
      releases: [{ id: "default", system: "steam", launchable: true }],
      launchable: true,
      metadata: {
        name: "Hollow Knight",
        genre: ["Metroidvania"],
        developer: "Team Cherry",
      },
      userData: {
        lastPlayed: new Date(Date.now() - 3 * 60 * 60_000),
        playtime: 270,
        favorite: true,
      },
      media: [
        {
          role: "tile",
          type: "image",
          width: 600,
          height: 900,
          assetId: "tile",
          url: "tile.png",
        },
        {
          role: "banner",
          type: "image",
          width: 1920,
          height: 620,
          assetId: "hero",
          url: "hero.png",
        },
      ],
      source: {
        hostId: "local",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    } satisfies CatalogEntry)

    expect(game).toMatchObject({
      id: "hollow-knight",
      title: "Hollow Knight",
      genre: "Metroidvania",
      developer: "Team Cherry",
      tileArtUrl: "tile.png",
      wideArtUrl: "hero.png",
      playtimeLabel: "4.5h",
      favorite: true,
    })
    expect(game.lastPlayedLabel).toBe("3h ago")
  })

  it("formats string last-played values from serialized catalog data", () => {
    const game = toCinematicGame({
      id: "serialized-game",
      itemId: "serialized-game",
      title: "Serialized Game",
      releases: [{ id: "default", system: "unknown", launchable: false }],
      launchable: false,
      userData: {
        lastPlayed: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      },
      source: {
        hostId: "local",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    } satisfies CatalogEntry)

    expect(game.lastPlayedLabel).toBe("2h ago")
  })

  it("omits invalid string last-played values", () => {
    const game = toCinematicGame({
      id: "invalid-date-game",
      itemId: "invalid-date-game",
      title: "Invalid Date Game",
      releases: [{ id: "default", system: "unknown", launchable: false }],
      launchable: false,
      userData: { lastPlayed: "not-a-date" },
      source: {
        hostId: "local",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    } satisfies CatalogEntry)

    expect(game.lastPlayedLabel).toBeUndefined()
  })

  it("omits chip fields when catalog entries do not carry them", () => {
    const game = toCinematicGame({
      id: "bare-game",
      itemId: "bare-game",
      title: "Bare Game",
      releases: [{ id: "default", system: "unknown", launchable: false }],
      launchable: false,
      source: {
        hostId: "local",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    } satisfies CatalogEntry)

    expect(game.genre).toBeUndefined()
    expect(game.developer).toBeUndefined()
    expect(game.lastPlayedLabel).toBeUndefined()
    expect(game.playtimeLabel).toBeUndefined()
    expect(game.favorite).toBeUndefined()
  })
})
