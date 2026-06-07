import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import { composeReadableLaunchSpec } from "./compose-launch-spec"
import type { AppRecord } from "./records/app"
import type { ReadableResolvedLaunchContext } from "./resolved-launch-context"

const steam: AppRecord = {
  id: "steam",
  command: "steam",
  args: ["{target}"],
  systems: ["windows"],
}

const retroarch: AppRecord = {
  id: "retroarch",
  command: "retroarch",
  args: ["-L", "{runtime.path}", "{content.path}"],
  systems: ["genesis"],
}

const context: ReadableResolvedLaunchContext = {
  playableId: "sonic-the-hedgehog",
  itemId: "sonic-the-hedgehog",
  releaseId: "genesis",
  system: "genesis",
  sourceId: "roms",
  target: "genesis/Sonic.md",
  app: retroarch,
  runtime: {
    id: "genesis-plus-gx",
    kind: "libretro-core",
    path: "/cores/genesis_plus_gx.so",
  },
  content: { path: "/games/genesis/Sonic.md" },
}

describe("composeReadableLaunchSpec", () => {
  it("substitutes Steam URI targets", async () => {
    const spec = await Effect.runPromise(
      composeReadableLaunchSpec(steam, {
        ...context,
        system: "windows",
        sourceId: "steam",
        target: "steam://rungameid/360740",
        app: steam,
        runtime: undefined,
        content: undefined,
      }),
    )

    expect(spec).toEqual({
      command: "steam",
      args: ["steam://rungameid/360740"],
    })
  })

  it("substitutes readable dotted placeholders", async () => {
    const spec = await Effect.runPromise(
      composeReadableLaunchSpec(retroarch, context),
    )

    expect(spec).toEqual({
      command: "retroarch",
      args: ["-L", "/cores/genesis_plus_gx.so", "/games/genesis/Sonic.md"],
    })
  })

  it("rejects retired placeholder names", async () => {
    for (const args of [
      ["{contentPath}"],
      ["{modulePath}"],
      ["{settings.appid}"],
    ]) {
      const exit = await Effect.runPromiseExit(
        composeReadableLaunchSpec({ ...retroarch, args }, context),
      )
      expect(exit._tag, args.join(" ")).toBe("Failure")
      expect(String(exit)).toContain("UnresolvedPlaceholder")
    }
  })
})
