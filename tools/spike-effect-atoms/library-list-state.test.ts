import { describe, expect, it } from "bun:test"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { games } from "@shared/fixtures/games/games"
import { Cause, Exit, Option } from "effect"
import { LaunchState, LibraryListState } from "./library-list-state"
import { LibraryError } from "./library-service"

const seedGames = games.slice(0, 3)

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

describe("LaunchState", () => {
  it("maps successful launch exits to Launched", () => {
    expect(
      LaunchState.fromExit(
        "crystalline-drift",
        Exit.succeed({ status: "launched" }),
      ),
    ).toEqual({ _tag: "Launched", gameId: "crystalline-drift" })
  })

  it("maps failed launch data to Failed", () => {
    expect(
      LaunchState.fromExit(
        "crystalline-drift",
        Exit.succeed({ status: "failed", exitCode: 7 }),
      ),
    ).toEqual({ _tag: "Failed", gameId: "crystalline-drift", exitCode: 7 })
  })

  it("maps failed exits to Defect", () => {
    expect(LaunchState.fromExit("crystalline-drift", Exit.die("boom"))).toEqual(
      { _tag: "Defect", gameId: "crystalline-drift", defect: "boom" },
    )
  })

  it("selects a launch case as an Option", () => {
    const state = LaunchState.launching("crystalline-drift")

    expect(Option.isSome(LaunchState.select("Launching")(state))).toBe(true)
    expect(Option.isNone(LaunchState.select("Failed")(state))).toBe(true)
  })
})
