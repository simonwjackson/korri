import { describe, expect, it } from "bun:test"

import {
  decodeByLauncherPayload,
  decodeInheritableLayer,
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
