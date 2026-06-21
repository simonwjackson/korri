import { describe, expect, it } from "bun:test"
import { Cause, Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { PicoDataState } from "./PicoDataState"

describe("PicoDataState", () => {
  it("renders loading before the atom has a value", () => {
    expect(PicoDataState.fromResult(AsyncResult.initial(true))).toEqual({
      _tag: "Loading",
    })
  })

  it("renders ready with the successful value", () => {
    expect(PicoDataState.fromResult(AsyncResult.success(["pico"]))).toEqual({
      _tag: "Ready",
      value: ["pico"],
    })
  })

  it("preserves typed load errors", () => {
    const error = { _tag: "PicoLoadError", message: "offline" } as const

    expect(PicoDataState.fromResult(AsyncResult.fail(error))).toEqual({
      _tag: "LoadError",
      error,
    })
  })

  it("renders defects distinctly from typed load errors", () => {
    expect(
      PicoDataState.fromResult(AsyncResult.failure(Cause.die("boom"))),
    ).toEqual({
      _tag: "Defect",
      defect: "boom",
    })
  })

  it("selects matching presentation cases", () => {
    const state = PicoDataState.fromResult(AsyncResult.success("ready"))

    expect(Option.isSome(PicoDataState.select("Ready")(state))).toBe(true)
    expect(Option.isNone(PicoDataState.select("Loading")(state))).toBe(true)
  })
})
