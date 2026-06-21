import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const
const Volume = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 }))

export const YfsLauncherSettings = Schema.Struct({
  audio: Schema.optional(Schema.Literals(["on", "off"])),
  gbaSounds: Schema.optional(Schema.Boolean),
  quickDeath: Schema.optional(Schema.Boolean),
  playTimer: Schema.optional(Schema.Boolean),
  bgmVolume: Schema.optional(Volume),
  sfxVolume: Schema.optional(Volume),
  debug: Schema.optional(Schema.Boolean),
  metrics: Schema.optional(Schema.Boolean),
})
export type YfsLauncherSettings = Schema.Schema.Type<typeof YfsLauncherSettings>

export function decodeYfsLauncherSettings(input: unknown): YfsLauncherSettings {
  return Schema.decodeUnknownSync(YfsLauncherSettings)(input ?? {}, STRICT)
}

function boolParam(value: boolean): string {
  return value ? "on" : "off"
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
