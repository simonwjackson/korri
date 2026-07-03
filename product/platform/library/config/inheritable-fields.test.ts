import { describe, expect, it } from "bun:test"

import {
  decodeByLauncherPayload,
  decodeInheritableLayer,
  decodePreferences,
  type LaunchCompanionMap,
} from "./inheritable-fields"

const frameProvider = "@fixture:frame" as const
const telemetryProvider = "@fixture:telemetry" as const

describe("launch companion config", () => {
  it("decodes provider-keyed launch companion maps without concrete provider schemas", () => {
    const layer = decodeInheritableLayer({
      launch: {
        with: {
          [frameProvider]: {
            enable: true,
            nested: { width: 1280, height: 720 },
          },
          [telemetryProvider]: { sampleRate: 10 },
        },
      },
    })

    expect(layer.launch?.with).toEqual({
      [frameProvider]: {
        enable: true,
        nested: { width: 1280, height: 720 },
      },
      [telemetryProvider]: { sampleRate: 10 },
    } satisfies LaunchCompanionMap)
  })

  it("rejects provider keys that do not use provider id syntax", () => {
    expect(() =>
      decodeInheritableLayer({ launch: { with: { frame: { enable: true } } } }),
    ).toThrow()
  })

  it("keeps retired top-level provider-specific fields out of generic layers", () => {
    expect(() =>
      decodeInheritableLayer({ providerSpecificWrapper: { enable: true } }),
    ).toThrow()
  })

  it("decodes byLauncher scoped provider maps", () => {
    expect(
      decodeByLauncherPayload({
        local: {
          launch: { with: { [frameProvider]: { mode: "scoped" } } },
        },
      }),
    ).toEqual({
      local: {
        launch: { with: { [frameProvider]: { mode: "scoped" } } },
      },
    })
  })
})

describe("launch preferences policy", () => {
  it("decodes the full phase-1 vocabulary", () => {
    const preferences = decodePreferences({
      launch: {
        video: {
          fullscreen: true,
          resolution: { width: 1280, height: 720 },
          "aspect-ratio": "16:9",
        },
        audio: { volume: 70 },
      },
    })

    expect(preferences.launch?.video?.fullscreen).toBe(true)
    expect(preferences.launch?.video?.resolution).toEqual({
      width: 1280,
      height: 720,
    })
    expect(preferences.launch?.video?.["aspect-ratio"]).toBe("16:9")
    expect(preferences.launch?.audio?.volume).toBe(70)
  })

  it("accepts empty and partial policies", () => {
    expect(decodePreferences({})).toEqual({})
    expect(decodePreferences({ launch: {} })).toEqual({ launch: {} })
  })

  it("carries a preferences block on a generic inheritable layer", () => {
    const layer = decodeInheritableLayer({
      preferences: { launch: { audio: { volume: 40 } } },
    })
    expect(layer.preferences?.launch?.audio?.volume).toBe(40)
  })

  it("rejects unknown keys under video", () => {
    expect(() =>
      decodePreferences({ launch: { video: { widht: 1 } } }),
    ).toThrow()
  })

  it("rejects out-of-range volume", () => {
    expect(() =>
      decodePreferences({ launch: { audio: { volume: -1 } } }),
    ).toThrow()
    expect(() =>
      decodePreferences({ launch: { audio: { volume: 101 } } }),
    ).toThrow()
  })

  it("rejects non-positive resolution and empty aspect-ratio", () => {
    expect(() =>
      decodePreferences({ launch: { video: { resolution: { width: 0, height: 720 } } } }),
    ).toThrow()
    expect(() =>
      decodePreferences({ launch: { video: { "aspect-ratio": "" } } }),
    ).toThrow()
  })
})
