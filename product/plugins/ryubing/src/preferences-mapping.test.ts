import { describe, expect, it } from "bun:test"
import {
  resolveRyubingPolicyInput,
  translatePreferencesToRyubing,
} from "./preferences-mapping"
import { decodeRyubingPolicy } from "./policy"

describe("translatePreferencesToRyubing", () => {
  it("maps fullscreen and volume to Ryubing's native shape", () => {
    expect(
      translatePreferencesToRyubing({
        video: { fullscreen: true },
        audio: { volume: 60 },
      }),
    ).toEqual({ display: { fullscreen: true }, audio: { volume: 60 } })
  })

  it("drops resolution — Ryubing has no absolute-pixel knob", () => {
    expect(
      translatePreferencesToRyubing({
        video: { resolution: { width: 1280, height: 720 } },
      }),
    ).toEqual({})
  })

  it("drops aspect-ratio in phase 1 (value map not yet verified)", () => {
    expect(
      translatePreferencesToRyubing({ video: { "aspect-ratio": "16:9" } }),
    ).toEqual({})
  })

  it("returns an empty object for empty/undefined preferences", () => {
    expect(translatePreferencesToRyubing(undefined)).toEqual({})
    expect(translatePreferencesToRyubing({})).toEqual({})
  })
})

describe("resolveRyubingPolicyInput", () => {
  it("uses shared preferences as the base", () => {
    const input = resolveRyubingPolicyInput({
      preferences: { launch: { audio: { volume: 40 } } },
      plugin: {},
    })
    expect(decodeRyubingPolicy(input).audio?.volume).toBe(40)
  })

  it("lets plugin-specific settings win over shared preferences", () => {
    const input = resolveRyubingPolicyInput({
      preferences: { launch: { video: { fullscreen: false } } },
      plugin: { display: { fullscreen: true } },
    })
    expect(decodeRyubingPolicy(input).display?.fullscreen).toBe(true)
  })
})
