import { describe, expect, it } from "bun:test"
import { decodeRetroArchPolicy } from "./policy"
import {
  resolveRetroarchPolicyInput,
  translatePreferencesToRetroarch,
} from "./preferences-mapping"

describe("translatePreferencesToRetroarch", () => {
  it("maps fullscreen to the native video flag", () => {
    expect(
      translatePreferencesToRetroarch({ video: { fullscreen: true } }),
    ).toEqual({ video: { fullscreen: true } })
  })

  it("splits resolution into native fullscreen width/height", () => {
    expect(
      translatePreferencesToRetroarch({
        video: { resolution: { width: 1280, height: 720 } },
      }),
    ).toEqual({ video: { fullscreenWidth: 1280, fullscreenHeight: 720 } })
  })

  it("drops aspect-ratio (index-mode, not a ratio string)", () => {
    expect(
      translatePreferencesToRetroarch({ video: { "aspect-ratio": "16:9" } }),
    ).toEqual({})
  })

  it("drops volume (RetroArch audio is in decibels, not percent)", () => {
    expect(translatePreferencesToRetroarch({ audio: { volume: 70 } })).toEqual(
      {},
    )
  })

  it("returns an empty object for empty/undefined preferences", () => {
    expect(translatePreferencesToRetroarch(undefined)).toEqual({})
    expect(translatePreferencesToRetroarch({})).toEqual({})
  })
})

describe("resolveRetroarchPolicyInput", () => {
  it("uses shared preferences as the base", () => {
    const input = resolveRetroarchPolicyInput({
      preferences: {
        launch: { video: { resolution: { width: 1280, height: 720 } } },
      },
      plugin: undefined,
    })
    const policy = decodeRetroArchPolicy(input)
    expect(policy.video?.fullscreenWidth).toBe(1280)
    expect(policy.video?.fullscreenHeight).toBe(720)
  })

  it("lets plugin-specific settings win over shared preferences", () => {
    const input = resolveRetroarchPolicyInput({
      preferences: { launch: { video: { fullscreen: false } } },
      plugin: { video: { fullscreen: true } },
    })
    expect(decodeRetroArchPolicy(input).video?.fullscreen).toBe(true)
  })

  it("preserves plugin-only video keys alongside translated preferences", () => {
    const input = resolveRetroarchPolicyInput({
      preferences: { launch: { video: { fullscreen: true } } },
      plugin: { video: { integerScale: true } },
    })
    const policy = decodeRetroArchPolicy(input)
    expect(policy.video?.fullscreen).toBe(true)
    expect(policy.video?.integerScale).toBe(true)
  })

  it("returns an empty object when nothing is authored", () => {
    expect(
      resolveRetroarchPolicyInput({
        preferences: undefined,
        plugin: undefined,
      }),
    ).toEqual({})
  })
})
