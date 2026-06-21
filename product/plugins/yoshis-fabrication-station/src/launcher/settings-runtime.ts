export interface YfsLauncherSettings {
  readonly audio?: "on" | "off"
  readonly gbaSounds?: boolean
  readonly quickDeath?: boolean
  readonly playTimer?: boolean
  readonly bgmVolume?: number
  readonly sfxVolume?: number
  readonly debug?: boolean
  readonly metrics?: boolean
}

const SETTING_KEYS = new Set([
  "audio",
  "gbaSounds",
  "quickDeath",
  "playTimer",
  "bgmVolume",
  "sfxVolume",
  "debug",
  "metrics",
])

function boolParam(value: boolean): string {
  return value ? "on" : "off"
}

function volume(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10
  )
    throw new Error(`${key} must be an integer 0..10`)
  return value as number
}

function booleanSetting(value: unknown, key: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "boolean") throw new Error(`${key} must be boolean`)
  return value
}

export function normalizeYfsLauncherSettings(
  input: unknown,
): YfsLauncherSettings {
  if (input === undefined || input === null) return {}
  if (typeof input !== "object" || Array.isArray(input))
    throw new Error("YFS settings must be an object")
  const record = input as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!SETTING_KEYS.has(key)) throw new Error(`unknown YFS setting: ${key}`)
  }
  const audio = record.audio
  if (audio !== undefined && audio !== "on" && audio !== "off")
    throw new Error("audio must be on|off")
  return {
    ...(audio !== undefined ? { audio } : {}),
    ...(record.gbaSounds !== undefined
      ? { gbaSounds: booleanSetting(record.gbaSounds, "gbaSounds") }
      : {}),
    ...(record.quickDeath !== undefined
      ? { quickDeath: booleanSetting(record.quickDeath, "quickDeath") }
      : {}),
    ...(record.playTimer !== undefined
      ? { playTimer: booleanSetting(record.playTimer, "playTimer") }
      : {}),
    ...(record.bgmVolume !== undefined
      ? { bgmVolume: volume(record.bgmVolume, "bgmVolume") }
      : {}),
    ...(record.sfxVolume !== undefined
      ? { sfxVolume: volume(record.sfxVolume, "sfxVolume") }
      : {}),
    ...(record.debug !== undefined
      ? { debug: booleanSetting(record.debug, "debug") }
      : {}),
    ...(record.metrics !== undefined
      ? { metrics: booleanSetting(record.metrics, "metrics") }
      : {}),
  } as YfsLauncherSettings
}

export function parseYfsSettingsJson(
  raw: string | undefined,
): YfsLauncherSettings {
  if (raw === undefined || raw.trim() === "") return {}
  try {
    return normalizeYfsLauncherSettings(JSON.parse(raw))
  } catch (error) {
    throw new Error(
      `KORRI_YFS_SETTINGS is invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function yfsSettingsQuery(
  settings: YfsLauncherSettings,
): URLSearchParams {
  const params = new URLSearchParams()
  if (settings.audio) params.set("audio", settings.audio)
  if (settings.gbaSounds !== undefined)
    params.set("gba_sounds", boolParam(settings.gbaSounds))
  if (settings.quickDeath !== undefined)
    params.set("quick_death", boolParam(settings.quickDeath))
  if (settings.playTimer !== undefined)
    params.set("play_timer", boolParam(settings.playTimer))
  if (settings.bgmVolume !== undefined)
    params.set("bgm_volume", String(settings.bgmVolume))
  if (settings.sfxVolume !== undefined)
    params.set("sfx_volume", String(settings.sfxVolume))
  if (settings.debug === true) params.set("debug", "1")
  if (settings.metrics === true) params.set("metrics", "1")
  return params
}

export function stableSettingsKey(settings: YfsLauncherSettings): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(settings).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  )
}
