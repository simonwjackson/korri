import { describe, expect, it } from "bun:test"
import { Exit, Option } from "effect"
import { LaunchState } from "./launch-state"

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

  it("preserves stderr tail for failed launch data", () => {
    expect(
      LaunchState.fromExit(
        "crystalline-drift",
        Exit.succeed({
          status: "failed",
          exitCode: 7,
          stderrTail: "boom",
        }),
      ),
    ).toEqual({
      _tag: "Failed",
      gameId: "crystalline-drift",
      exitCode: 7,
      stderrTail: "boom",
    })
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
