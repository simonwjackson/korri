import { describe, expect, it } from "bun:test"
import { Result } from "effect"

import {
  expandHookProfiles,
  UnknownHookProfile,
} from "./hook-profile-expansion"
import {
  decodeHookProfilePayload,
  type HookProfilePayload,
} from "./records/hook-profile"

const profiles = (
  entries: Readonly<Record<string, HookProfilePayload>>,
): ReadonlyMap<string, HookProfilePayload> => new Map(Object.entries(entries))

const batterySaver: HookProfilePayload = {
  before: [{ name: "cap-clocks", run: "echo cap" }],
  after: [{ name: "restore-clocks", run: "echo restore" }],
}

const display60: HookProfilePayload = {
  before: [{ name: "display-60hz", run: "echo 60" }],
  after: [{ name: "display-120hz", run: "echo 120" }],
}

describe("expandHookProfiles", () => {
  it("expands a layer with only use into the profile's before/after lists", () => {
    const result = expandHookProfiles(
      { use: ["battery-saver"] },
      profiles({ "battery-saver": batterySaver }),
      { layer: "release 'switch'" },
    )
    const expanded = Result.getOrThrow(result)
    expect(expanded.before).toEqual([{ name: "cap-clocks", run: "echo cap" }])
    expect(expanded.after).toEqual([
      { name: "restore-clocks", run: "echo restore" },
    ])
  })

  it("places profile steps before the layer's inline steps in both lists", () => {
    const result = expandHookProfiles(
      {
        use: ["battery-saver"],
        before: [{ name: "inline-before", run: "echo inline-before" }],
        after: [{ name: "inline-after", run: "echo inline-after" }],
      },
      profiles({ "battery-saver": batterySaver }),
      { layer: "host" },
    )
    const expanded = Result.getOrThrow(result)
    expect(expanded.before.map(step => step.name)).toEqual([
      "cap-clocks",
      "inline-before",
    ])
    expect(expanded.after.map(step => step.name)).toEqual([
      "restore-clocks",
      "inline-after",
    ])
  })

  it("concatenates two referenced profiles in reference order", () => {
    const result = expandHookProfiles(
      { use: ["display-60", "battery-saver"] },
      profiles({ "battery-saver": batterySaver, "display-60": display60 }),
      { layer: "host" },
    )
    const expanded = Result.getOrThrow(result)
    expect(expanded.before.map(step => step.name)).toEqual([
      "display-60hz",
      "cap-clocks",
    ])
    expect(expanded.after.map(step => step.name)).toEqual([
      "display-120hz",
      "restore-clocks",
    ])
  })

  it("expands a profile with only before (no after) cleanly", () => {
    const result = expandHookProfiles(
      { use: ["before-only"] },
      profiles({ "before-only": { before: [{ run: "echo only-before" }] } }),
      { layer: "host" },
    )
    const expanded = Result.getOrThrow(result)
    expect(expanded.before).toEqual([{ run: "echo only-before" }])
    expect(expanded.after).toEqual([])
  })

  it("returns empty lists for an absent hooks policy", () => {
    const expanded = Result.getOrThrow(
      expandHookProfiles(undefined, profiles({}), { layer: "host" }),
    )
    expect(expanded).toEqual({ before: [], after: [] })
  })

  it("fails with the missing id and layer label for an unknown profile", () => {
    const result = expandHookProfiles(
      { use: ["battery-saver", "no-such-profile"] },
      profiles({ "battery-saver": batterySaver }),
      { layer: "release 'switch'" },
    )
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      const error = result.failure
      expect(error).toBeInstanceOf(UnknownHookProfile)
      expect(error.profileId).toBe("no-such-profile")
      expect(error.layer).toBe("release 'switch'")
      expect(error.message).toContain("no-such-profile")
      expect(error.message).toContain("release 'switch'")
    }
  })
})

describe("HookProfilePayload schema", () => {
  it("decodes a payload-only body with before and after lists", () => {
    const profile = decodeHookProfilePayload({
      before: [{ name: "cap-clocks", run: "echo cap", "on-failure": "warn" }],
      after: [{ name: "restore-clocks", run: "echo restore" }],
    })
    expect(profile.before?.[0]?.name).toBe("cap-clocks")
    expect(profile.after?.[0]?.name).toBe("restore-clocks")
  })

  it("rejects a profile body containing use (one-level reference graph)", () => {
    expect(() =>
      decodeHookProfilePayload({
        before: [{ run: "echo cap" }],
        use: ["other-profile"],
      }),
    ).toThrow()
  })

  it("rejects an id duplicated inside the body (id comes from the YAML key)", () => {
    expect(() =>
      decodeHookProfilePayload({
        id: "battery-saver",
        before: [{ run: "echo cap" }],
      }),
    ).toThrow()
  })
})
