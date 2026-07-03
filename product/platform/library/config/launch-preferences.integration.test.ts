import { describe, expect, it } from "bun:test"
import type { ConfigValue } from "@product/plugins/rpcs3/src/mapping"
import { routeSettings } from "@product/plugins/rpcs3/src/mapping"
import { decodeRpcs3Policy } from "@product/plugins/rpcs3/src/policy"
import { resolveRpcs3PolicyInput } from "@product/plugins/rpcs3/src/preferences-mapping"
import { renderRyubingConfig } from "@product/plugins/ryubing/src/launch-spec"
import { decodeRyubingPolicy } from "@product/plugins/ryubing/src/policy"
import { resolveRyubingPolicyInput } from "@product/plugins/ryubing/src/preferences-mapping"
import { Effect } from "effect"

import {
  type ReadableConfigSnapshot,
  resolveReadableLaunchContext,
} from "./cascade-resolver"
import type { AppRecord } from "./records/app"
import type { LibraryItemRecord } from "./records/library-item"
import type { UserRecord } from "./records/user"

const RPCS3 = "@korri:rpcs3"
const RYUBING = "@korri:ryubing"

const rpcs3App = {
  id: `${RPCS3}/rpcs3`,
  plugin: RPCS3,
  command: "/usr/bin/rpcs3",
  systems: ["ps3"],
} as AppRecord

const ryubingApp = {
  id: `${RYUBING}/ryubing`,
  plugin: RYUBING,
  command: "/usr/bin/ryubing",
  systems: ["switch"],
} as AppRecord

// The whole point: one shared block, authored once at the user layer.
const userWithSharedPreferences: UserRecord = {
  id: "simon",
  preferences: {
    launch: {
      video: {
        fullscreen: true,
        resolution: { width: 1280, height: 720 },
        "aspect-ratio": "16:9",
      },
      audio: { volume: 70 },
    },
  },
} as UserRecord

const ps3Game = (
  releaseOverrides: Partial<LibraryItemRecord["releases"][number]> = {},
): LibraryItemRecord =>
  ({
    id: "demons-souls",
    releases: [
      {
        id: "disc",
        system: "ps3",
        target: { kind: "file", storage: "roms", path: "ps3/DemonsSouls" },
        launch: { use: `${RPCS3}/rpcs3` },
        ...releaseOverrides,
      },
    ],
  }) as LibraryItemRecord

const switchGame: LibraryItemRecord = {
  id: "mario-odyssey",
  releases: [
    {
      id: "cart",
      system: "switch",
      target: { kind: "file", storage: "roms", path: "switch/Odyssey.nsp" },
      launch: { use: `${RYUBING}/ryubing` },
    },
  ],
} as LibraryItemRecord

const snapshotOf = (
  ...items: readonly LibraryItemRecord[]
): ReadableConfigSnapshot => ({
  host: null,
  users: new Map([["simon", userWithSharedPreferences]]),
  systems: new Map(),
  readableLaunchers: new Map([
    [rpcs3App.id, rpcs3App],
    [ryubingApp.id, ryubingApp],
  ]),
  runtimes: new Map(),
  profiles: new Map(),
  storage: new Map([["roms", { id: "roms", root: "/games" }]]),
  library: new Map(items.map(item => [item.id, item])),
})

const rpcs3ConfigMap = (context: {
  readonly preferences?: unknown
  readonly plugin?: Readonly<Record<string, unknown>>
}): Record<string, ConfigValue> => {
  const routed = routeSettings(
    decodeRpcs3Policy(
      resolveRpcs3PolicyInput({
        preferences: context.preferences as { launch?: never } | undefined,
        plugin: context.plugin?.[RPCS3] as Record<string, unknown> | undefined,
      }),
    ),
  )
  return Object.fromEntries(routed.configEntries)
}

describe("cross-launcher launch preferences (integration)", () => {
  it("applies one shared preference across RPCS3 and Ryubing, dropping resolution on Switch", async () => {
    const snap = snapshotOf(ps3Game(), switchGame)

    const ps3Context = await Effect.runPromise(
      resolveReadableLaunchContext(snap, {
        playableId: "demons-souls",
        userId: "simon",
      }),
    )
    const switchContext = await Effect.runPromise(
      resolveReadableLaunchContext(snap, {
        playableId: "mario-odyssey",
        userId: "simon",
      }),
    )

    // F1: the shared block reached both resolved contexts.
    expect(ps3Context.preferences?.launch?.audio?.volume).toBe(70)
    expect(switchContext.preferences?.launch?.audio?.volume).toBe(70)

    // RPCS3 honors resolution, aspect ratio, volume, fullscreen.
    const rpcs3Config = rpcs3ConfigMap(ps3Context)
    expect(rpcs3Config["Video.Resolution"]).toBe("1280x720")
    expect(rpcs3Config["Video.Aspect ratio"]).toBe("16:9")
    expect(rpcs3Config["Audio.Master Volume"]).toBe(70)

    // Ryubing honors volume + fullscreen, and silently drops resolution (F3/R4).
    const ryubingConfig = renderRyubingConfig(
      decodeRyubingPolicy(
        resolveRyubingPolicyInput({
          preferences: switchContext.preferences,
          plugin: switchContext.plugin?.[RYUBING] as
            | Record<string, unknown>
            | undefined,
        }),
      ),
    )
    expect(ryubingConfig.audio_volume).toBe(70)
    expect(ryubingConfig.start_fullscreen).toBe(true)
    expect(ryubingConfig).not.toHaveProperty("resolution_scale")
    expect(ryubingConfig).not.toHaveProperty("aspect_ratio")
  })

  it("lets a launcher-specific release setting override the shared preference (F2/R5)", async () => {
    const snap = snapshotOf(
      ps3Game({
        launch: {
          use: `${RPCS3}/rpcs3`,
          settings: { plugin: { audio: { volume: 100 } } },
        },
      }),
    )

    const ps3Context = await Effect.runPromise(
      resolveReadableLaunchContext(snap, {
        playableId: "demons-souls",
        userId: "simon",
      }),
    )

    // Shared preference is 70; the release-level plugin setting wins.
    expect(rpcs3ConfigMap(ps3Context)["Audio.Master Volume"]).toBe(100)
  })
})
