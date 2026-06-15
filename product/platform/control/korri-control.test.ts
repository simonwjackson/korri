import { describe, expect, it } from "bun:test"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { semanticsForControlResult } from "./control-results"
import { findPlayableEntry } from "./korri-control"

const entries: readonly PlayableLibraryEntry[] = [
  playable("snes/echo.smc", "Echo Runner"),
  playable("snes/echo-2.smc", "Echo Runner 2"),
  playable("nes/mario.nes", "Super Echo"),
]

describe("KorriControl shared contracts", () => {
  it("finds exact playable ids before fuzzy title/id matches", () => {
    const result = findPlayableEntry(entries, { query: "snes/echo.smc" })

    expect(result).toMatchObject({
      _tag: "GameFound",
      match: "exact-id",
      game: { id: "snes/echo.smc" },
    })
  })

  it("returns ambiguous candidates instead of selecting a fuzzy match arbitrarily", () => {
    const result = findPlayableEntry(entries, { query: "echo" })

    expect(result).toEqual({
      _tag: "AmbiguousGame",
      query: "echo",
      candidates: [
        { id: "snes/echo.smc", title: "Echo Runner" },
        { id: "snes/echo-2.smc", title: "Echo Runner 2" },
        { id: "nes/mario.nes", title: "Super Echo" },
      ],
    })
  })

  it("returns typed not-found and missing-query results", () => {
    expect(findPlayableEntry(entries, { query: "zelda" })).toEqual({
      _tag: "GameNotFound",
      query: "zelda",
      candidates: [],
    })
    expect(findPlayableEntry(entries, { query: "   " })).toEqual({
      _tag: "MissingQuery",
    })
  })

  it("maps shared result variants to CLI and Pi adapter semantics", () => {
    expect(
      semanticsForControlResult({
        _tag: "NothingToStop",
      }),
    ).toMatchObject({ cliOutcome: "success", piIsError: false })
    expect(
      semanticsForControlResult({
        _tag: "ConfirmationRequired",
        action: "force-stop-session",
      }),
    ).toMatchObject({ cliOutcome: "usage", piIsError: true })
    expect(
      semanticsForControlResult({
        _tag: "StopPending",
        launchId: "launch-1",
        force: false,
        mode: "restoring",
      }),
    ).toMatchObject({ cliOutcome: "host-unavailable", piIsError: true })
    expect(
      semanticsForControlResult({
        _tag: "HostUnavailable",
        message: "no socket",
      }),
    ).toMatchObject({ cliOutcome: "host-unavailable", piIsError: true })
    expect(
      semanticsForControlResult({
        _tag: "ListGamesUnavailable",
        message: "offline",
      }),
    ).toMatchObject({ cliOutcome: "host-unavailable", piIsError: true })
  })
})

function playable(id: string, title: string): PlayableLibraryEntry {
  return {
    id,
    itemId: id,
    title,
    launchable: true,
    releases: [{ id: "default", system: "snes", launchable: true }],
  }
}
