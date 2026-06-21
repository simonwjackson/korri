import { describe, expect, it } from "bun:test"
import { decodeYfsLauncherSettings, yfsSettingsQuery } from "./settings"

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
    })
  })

  it("rejects unknown keys, invalid booleans, and invalid volume ranges", () => {
    expect(() => decodeYfsLauncherSettings({ extra: true })).toThrow()
    expect(() => decodeYfsLauncherSettings({ gbaSounds: "yes" })).toThrow()
    expect(() => decodeYfsLauncherSettings({ bgmVolume: 11 })).toThrow()
    expect(() => decodeYfsLauncherSettings({ sfxVolume: -1 })).toThrow()
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
        }),
      ).toString(),
    ).toBe(
      "audio=on&gba_sounds=off&quick_death=on&play_timer=off&bgm_volume=10&sfx_volume=0&metrics=1",
    )
  })
})
