import { describe, expect, it } from "bun:test"
import { decodeRpcs3Policy } from "./policy"
import {
  resolveRpcs3PolicyInput,
  translatePreferencesToRpcs3,
} from "./preferences-mapping"

describe("translatePreferencesToRpcs3", () => {
  it("renders resolution {width,height} to the native WxH string", () => {
    expect(
      translatePreferencesToRpcs3({
        video: { resolution: { width: 1280, height: 720 } },
      }),
    ).toEqual({ video: { resolution: "1280x720" } })
  })

  it("maps fullscreen, aspect-ratio, and volume", () => {
    expect(
      translatePreferencesToRpcs3({
        video: { fullscreen: true, "aspect-ratio": "16:9" },
        audio: { volume: 70 },
      }),
    ).toEqual({
      video: { fullscreen: true, aspectRatio: "16:9" },
      audio: { volume: 70 },
    })
  })

  it("drops an aspect-ratio RPCS3 cannot express", () => {
    expect(
      translatePreferencesToRpcs3({ video: { "aspect-ratio": "21:9" } }),
    ).toEqual({})
  })

  it("returns an empty object for empty/undefined preferences", () => {
    expect(translatePreferencesToRpcs3(undefined)).toEqual({})
    expect(translatePreferencesToRpcs3({})).toEqual({})
  })
})

describe("resolveRpcs3PolicyInput", () => {
  it("uses shared preferences as the base", () => {
    const input = resolveRpcs3PolicyInput({
      preferences: { launch: { audio: { volume: 55 } } },
      plugin: {},
    })
    expect(decodeRpcs3Policy(input).audio?.volume).toBe(55)
  })

  it("lets plugin-specific settings win over shared preferences", () => {
    const input = resolveRpcs3PolicyInput({
      preferences: { launch: { video: { fullscreen: false } } },
      plugin: { video: { fullscreen: true } },
    })
    expect(decodeRpcs3Policy(input).video?.fullscreen).toBe(true)
  })

  it("preserves plugin-only keys alongside translated preferences", () => {
    const input = resolveRpcs3PolicyInput({
      preferences: { launch: { video: { fullscreen: true } } },
      plugin: { audio: { backend: "cubeb" } },
    })
    const policy = decodeRpcs3Policy(input)
    expect(policy.video?.fullscreen).toBe(true)
    expect(policy.audio?.backend).toBe("cubeb")
  })
})
