import { describe, expect, it } from "bun:test"

import {
  type ConfigSnapshot,
  emptySnapshot,
  resolveLocalLauncherCompanionPolicy,
  resolveLocalLauncherPolicy,
} from "./cascade-resolver"
import type { EphemeralOverride } from "./ephemeral-override"
import type { Preferences } from "./inheritable-fields"
import type { GlobalConfigRecord } from "./records/global"
import type { LauncherRecord } from "./records/launcher"

import {
  decodeInputSeatPolicy,
  INPUT_SEAT_PROVIDER_ID,
} from "@platform/input-seat/policy"

const frameProvider = "@fixture:frame" as const
const telemetryProvider = "@fixture:telemetry" as const

const globalConfig = (
  launch: GlobalConfigRecord["launch"],
): GlobalConfigRecord => ({ id: "global", launch }) as GlobalConfigRecord

const launcher = (launch: LauncherRecord["launch"]): LauncherRecord => ({
  id: "local",
  command: "runner",
  args: [],
  systems: [],
  launch,
})

const snapshot = (input: {
  readonly global?: GlobalConfigRecord
  readonly launchers?: readonly LauncherRecord[]
}): ConfigSnapshot => ({
  ...emptySnapshot(),
  global: input.global ?? null,
  launchers: new Map(input.launchers?.map(item => [item.id, item]) ?? []),
})

describe("resolveLocalLauncherCompanionPolicy", () => {
  it("folds provider-keyed launch companion maps without provider-specific schemas", () => {
    const snap = snapshot({
      global: globalConfig({
        with: {
          [frameProvider]: {
            enable: true,
            display: { nested: { width: 1280, height: 720 } },
            extraArgs: ["global"],
          },
        },
      }),
      launchers: [
        launcher({
          with: {
            [frameProvider]: {
              display: { nested: { width: 1920 } },
              extraArgs: ["launcher"],
            },
          },
        }),
      ],
    })

    expect(
      resolveLocalLauncherCompanionPolicy(snap, { launcherId: "local" }),
    ).toEqual({
      [frameProvider]: {
        enable: true,
        display: { nested: { width: 1920, height: 720 } },
        extraArgs: ["global", "launcher"],
      },
    })
  })

  it("preserves a second provider with a different payload shape", () => {
    const snap = snapshot({
      global: globalConfig({
        with: {
          [telemetryProvider]: { sampleRate: 1, labels: ["global"] },
        },
      }),
      launchers: [
        launcher({
          with: {
            [telemetryProvider]: { sink: "file", labels: ["launcher"] },
          },
        }),
      ],
    })

    expect(
      resolveLocalLauncherPolicy(snap, { launcherId: "local" })
        .launchCompanions,
    ).toEqual({
      [telemetryProvider]: {
        sampleRate: 1,
        sink: "file",
        labels: ["global", "launcher"],
      },
    })
  })

  it("folds runtime overrides after persisted launcher policy", () => {
    const snap = snapshot({
      launchers: [
        launcher({ with: { [frameProvider]: { mode: "persisted" } } }),
      ],
    })
    const override: EphemeralOverride = {
      launch: { with: { [frameProvider]: { mode: "override" } } },
    }

    expect(
      resolveLocalLauncherCompanionPolicy(snap, {
        launcherId: "local",
        override,
      }),
    ).toEqual({ [frameProvider]: { mode: "override" } })
  })
})

describe("launch preferences folding", () => {
  const withPreferences = <T extends { id: string }>(
    base: T,
    preferences: Preferences,
  ): T => ({ ...base, preferences }) as T

  it("deep-merges launch preferences across layers, scalars last-win", () => {
    const snap = snapshot({
      global: withPreferences(globalConfig(undefined), {
        launch: { video: { fullscreen: true }, audio: { volume: 50 } },
      }),
      launchers: [
        withPreferences(launcher(undefined), {
          launch: { audio: { volume: 80 } },
        }),
      ],
    })

    expect(
      resolveLocalLauncherPolicy(snap, { launcherId: "local" }).preferences,
    ).toEqual({
      launch: { video: { fullscreen: true }, audio: { volume: 80 } },
    })
  })
})

describe("input-seat launch companion folding", () => {
  it("folds input-seat policy through launch.with and leaves validation to the provider schema", () => {
    const snap = snapshot({
      launchers: [
        launcher({
          with: {
            [INPUT_SEAT_PROVIDER_ID]: {
              runtimeSupportsExtraSeats: true,
              playerCount: 4,
            },
          },
        }),
      ],
    })
    const override: EphemeralOverride = {
      launch: { with: { [INPUT_SEAT_PROVIDER_ID]: { playerCount: 2 } } },
    }

    const companions = resolveLocalLauncherCompanionPolicy(snap, {
      launcherId: "local",
      override,
    })

    expect(companions[INPUT_SEAT_PROVIDER_ID]).toEqual({
      runtimeSupportsExtraSeats: true,
      playerCount: 2,
    })
    expect(decodeInputSeatPolicy(companions[INPUT_SEAT_PROVIDER_ID])).toMatchObject({
      enabled: true,
      playerCount: 2,
      runtimeSupportsExtraSeats: true,
    })
  })
})
