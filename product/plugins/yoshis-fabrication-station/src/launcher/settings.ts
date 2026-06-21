import { Schema } from "effect"
import {
  stableSettingsKey,
  type YfsLauncherSettings,
  yfsSettingsQuery,
} from "./settings-runtime"

const STRICT = { onExcessProperty: "error" } as const
const Volume = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 }))

export const YfsLauncherSettingsSchema = Schema.Struct({
  audio: Schema.optional(Schema.Literals(["on", "off"])),
  gbaSounds: Schema.optional(Schema.Boolean),
  quickDeath: Schema.optional(Schema.Boolean),
  playTimer: Schema.optional(Schema.Boolean),
  bgmVolume: Schema.optional(Volume),
  sfxVolume: Schema.optional(Volume),
  debug: Schema.optional(Schema.Boolean),
  metrics: Schema.optional(Schema.Boolean),
})

export type { YfsLauncherSettings }
export { stableSettingsKey, yfsSettingsQuery }

export function decodeYfsLauncherSettings(input: unknown): YfsLauncherSettings {
  return Schema.decodeUnknownSync(YfsLauncherSettingsSchema)(
    input ?? {},
    STRICT,
  ) as YfsLauncherSettings
}
