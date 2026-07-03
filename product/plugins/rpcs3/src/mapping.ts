import type { Rpcs3Policy } from "./policy"

/**
 * Unified-setting delivery router.
 *
 * The authoring schema (policy.ts) is delivery-agnostic; this module is the
 * single place that decides *how* each semantic setting reaches RPCS3 —
 * argv flag, `config.yml` entry, or GUI `CurrentSettings.ini` entry — and
 * translates clean Korri values into RPCS3's exact config strings.
 *
 * All RPCS3 target strings and enum values are verified against RPCS3
 * `system_config.h` / `system_config_types.cpp` / `gui_settings.h`
 * (build 0.0.41-nixpkgs-40e9ee5). This is the single source of truth for
 * those strings, so version drift is contained to this file.
 */

export type ConfigValue = string | number | boolean
export type ConfigEntry = readonly [path: string, value: ConfigValue]
export type IniEntry = readonly [section: string, key: string, value: boolean]

export interface RoutedSettings {
  readonly flags: readonly string[]
  readonly configEntries: readonly ConfigEntry[]
  readonly iniEntries: readonly IniEntry[]
}

/** RPCS3 vsync_mode enum: off launches map to Disabled, on to Full. */
const VSYNC_ON = "Full"
const VSYNC_OFF = "Disabled"

/** RPCS3 frame_limit_type named modes → config strings. */
const FRAME_LIMIT_MODE: Readonly<Record<string, string>> = {
  off: "Off",
  auto: "Auto",
  native: "PS3 Native",
  infinite: "Infinite",
  display: "Display",
}

/** GUI popup toggles live under [main_window] in GuiConfigs/CurrentSettings.ini. */
export const RPCS3_POPUP_INI_SECTION = "main_window"

/**
 * The full set of RPCS3 "don't show this box again" GUI toggles. All default
 * to `true` (show); suppression sets them to `false` for unattended boots.
 */
export const RPCS3_POPUP_INI_KEYS = [
  "infoBoxEnabledInstallPKG",
  "infoBoxEnabledInstallPUP",
  "infoBoxEnabledWelcome",
  "confirmationBoxExitGame",
  "confirmationBoxBootGame",
  "confirmationObsoleteCfg",
  "confirmationSameButtons",
  "confirmationRestart",
] as const

const renderFrameLimit = (value: number | string): ConfigValue =>
  typeof value === "number" ? String(value) : (FRAME_LIMIT_MODE[value] ?? value)

/**
 * Route a decoded policy into delivery buckets. A single semantic setting may
 * emit to more than one bucket (e.g. `video.fullscreen` → flag AND config),
 * and boolean `false` is written to config when omission would not disable it
 * against RPCS3's own defaults.
 */
export const routeSettings = (policy: Rpcs3Policy): RoutedSettings => {
  const flags: string[] = []
  const configEntries: Array<ConfigEntry> = []
  const iniEntries: Array<IniEntry> = []

  const video = policy.video
  if (video) {
    if (video.resolution !== undefined) {
      configEntries.push(["Video.Resolution", video.resolution])
    }
    if (video.aspectRatio !== undefined) {
      configEntries.push(["Video.Aspect ratio", video.aspectRatio])
    }
    if (video.frameLimit !== undefined) {
      configEntries.push(["Video.Frame limit", renderFrameLimit(video.frameLimit)])
    }
    if (video.vsync !== undefined) {
      configEntries.push(["Video.VSync Mode", video.vsync ? VSYNC_ON : VSYNC_OFF])
    }
    if (video.fullscreen !== undefined) {
      // A flag can only express "on"; false must be written to config to
      // override RPCS3's default (Start games in fullscreen mode = true).
      if (video.fullscreen) flags.push("--fullscreen")
      configEntries.push([
        "Miscellaneous.Start games in fullscreen mode",
        video.fullscreen,
      ])
    }
  }

  const audio = policy.audio
  if (audio) {
    if (audio.volume !== undefined) {
      configEntries.push(["Audio.Master Volume", audio.volume])
    }
    if (audio.device !== undefined) {
      configEntries.push(["Audio.Audio Device", audio.device])
    }
  }

  const boot = policy.boot
  if (boot) {
    if (boot.headless) flags.push("--headless")
    if (boot.exitOnFinish !== undefined) {
      configEntries.push([
        "Miscellaneous.Exit RPCS3 when process finishes",
        boot.exitOnFinish,
      ])
    }
    if (boot.autoStart !== undefined) {
      configEntries.push([
        "Miscellaneous.Automatically start games after boot",
        boot.autoStart,
      ])
    }
    if (boot.suppressPopups) {
      for (const key of RPCS3_POPUP_INI_KEYS) {
        iniEntries.push([RPCS3_POPUP_INI_SECTION, key, false])
      }
    }
  }

  return { flags, configEntries, iniEntries }
}
