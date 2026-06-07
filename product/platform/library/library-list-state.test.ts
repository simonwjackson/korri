import { describe, expect, it } from "bun:test"
import { LibraryError } from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { Cause, Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { LibraryListState } from "./library-list-state"

const seedGames: readonly PlayableLibraryEntry[] = [
  {
    id: "downwell",
    itemId: "downwell",
    title: "Downwell",
    launchable: true,
    releases: [{ id: "windows", system: "windows", launchable: true }],
  },
]

describe("LibraryListState", () => {
  it("maps waiting results to Loading", () => {
    expect(LibraryListState.fromResult(AsyncResult.initial(true))).toEqual({
      _tag: "Loading",
    })
  })

  it("maps successful results to Ready", () => {
    expect(LibraryListState.fromResult(AsyncResult.success(seedGames))).toEqual(
      {
        _tag: "Ready",
        games: seedGames,
      },
    )
  })

  it("maps typed failures to LoadError", () => {
    const error = new LibraryError({ reason: "io", message: "disk" })

    expect(LibraryListState.fromResult(AsyncResult.fail(error))).toEqual({
      _tag: "LoadError",
      error,
    })
  })

  it("maps defects to Defect", () => {
    expect(
      LibraryListState.fromResult(AsyncResult.failure(Cause.die("boom"))),
    ).toEqual({ _tag: "Defect", defect: "boom" })
  })

  it("selects a state case as an Option", () => {
    const state = LibraryListState.fromResult(AsyncResult.success(seedGames))

    expect(Option.isSome(LibraryListState.select("Ready")(state))).toBe(true)
    expect(Option.isNone(LibraryListState.select("LoadError")(state))).toBe(
      true,
    )
  })
})
