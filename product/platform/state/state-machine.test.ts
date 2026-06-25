import { describe, expect, it } from "bun:test"
import { Option } from "effect"
import { stateMachine } from "./state-machine"

type Light =
  | { readonly _tag: "Red" }
  | { readonly _tag: "Green"; readonly since: number }

describe("stateMachine", () => {
  const machine = stateMachine<Light>(["Red", "Green"])

  it("exposes the case list as the single source of truth for enumeration", () => {
    expect(machine.tags).toEqual(["Red", "Green"])
  })

  it("selects and narrows the matching case", () => {
    const picked = machine.select("Green")({ _tag: "Green", since: 5 })
    expect(Option.isSome(picked)).toBe(true)
    expect(Option.getOrThrow(picked).since).toBe(5)
  })

  it("returns None for a non-matching case", () => {
    expect(
      Option.isNone(machine.select("Red")({ _tag: "Green", since: 1 })),
    ).toBe(true)
  })
})
