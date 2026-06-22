import { describe, expect, it } from "bun:test"
import {
  decodeYfsLauncherSettings,
  resolveYfsViewport,
  resolveYfsZoomScale,
  yfsSettingsQuery,
} from "./settings"

describe("YFS launcher settings", () => {
  it("decodes the supported YFS launcher settings", () => {
    const settings = decodeYfsLauncherSettings({
      audio: "off",
      gbaSounds: true,
      quickDeath: false,
      playTimer: true,
      bgmVolume: 7,
      sfxVolume: 3,
      debug: true,
      metrics: true,
      viewport: { aspect: "1:1", policy: "expand-only" },
      zoom: { mode: "auto-area", multiplier: 1.15 },
    })

    expect(settings).toMatchObject({
      audio: "off",
      gbaSounds: true,
      quickDeath: false,
      playTimer: true,
      bgmVolume: 7,
      sfxVolume: 3,
      debug: true,
      metrics: true,
      viewport: { aspect: "1:1", policy: "expand-only" },
      zoom: { mode: "auto-area", multiplier: 1.15 },
    })
  })

  it("rejects unknown keys, invalid booleans, and invalid volume ranges", () => {
    expect(() => decodeYfsLauncherSettings({ extra: true })).toThrow()
    expect(() => decodeYfsLauncherSettings({ gbaSounds: "yes" })).toThrow()
    expect(() => decodeYfsLauncherSettings({ bgmVolume: 11 })).toThrow()
    expect(() => decodeYfsLauncherSettings({ sfxVolume: -1 })).toThrow()
    expect(() =>
      decodeYfsLauncherSettings({ viewport: { width: 0, height: 832 } }),
    ).toThrow()
    expect(() =>
      decodeYfsLauncherSettings({ viewport: { aspect: "nope" } }),
    ).toThrow()
    expect(() =>
      decodeYfsLauncherSettings({ zoom: { mode: "fixed", scale: 0 } }),
    ).toThrow()
    expect(() =>
      decodeYfsLauncherSettings({ zoom: { mode: "fixed", scale: 100 } }),
    ).toThrow()
  })

  it("projects settings to YFS query parameters", () => {
    expect(
      yfsSettingsQuery(
        decodeYfsLauncherSettings({
          audio: "on",
          gbaSounds: false,
          quickDeath: true,
          playTimer: false,
          bgmVolume: 10,
          sfxVolume: 0,
          metrics: true,
          viewport: { width: 832, height: 832 },
          zoom: { mode: "fixed", scale: 1.5 },
        }),
      ).toString(),
    ).toBe(
      "audio=on&gba_sounds=off&quick_death=on&play_timer=off&bgm_volume=10&sfx_volume=0&metrics=1&viewport_width=832&viewport_height=832&zoom_mode=fixed&zoom_scale=1.5",
    )
  })

  it("resolves viewport aspect policy and aspect-aware zoom", () => {
    const settings = decodeYfsLauncherSettings({
      viewport: { aspect: "1:1", policy: "expand-only" },
      zoom: { mode: "auto-area", multiplier: 1 },
    })

    expect(resolveYfsViewport(settings)).toEqual({ width: 832, height: 832 })
    expect(resolveYfsZoomScale(settings)).toBe(1.363)
  })
})
