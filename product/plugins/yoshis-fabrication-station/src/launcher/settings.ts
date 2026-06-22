import { Schema } from "effect"
import {
  normalizeYfsLauncherSettings,
  resolveYfsViewport,
  resolveYfsZoomScale,
  stableSettingsKey,
  type YfsLauncherSettings,
  yfsSettingsQuery,
} from "./settings-runtime"

const Volume = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 }))
const PositiveBoundedInt = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 8192 }),
)
const PositiveScale = Schema.Number.check(
  Schema.isBetween({ minimum: 0.001, maximum: 16 }),
)

export const YfsViewportSettingsSchema = Schema.Struct({
  width: Schema.optional(PositiveBoundedInt),
  height: Schema.optional(PositiveBoundedInt),
  aspect: Schema.optional(Schema.String),
  policy: Schema.optional(Schema.Literals(["expand-only"])),
})

export const YfsZoomSettingsSchema = Schema.Struct({
  mode: Schema.Literals(["auto-area", "fixed"]),
  scale: Schema.optional(PositiveScale),
  multiplier: Schema.optional(PositiveScale),
})

export const YfsLauncherSettingsSchema = Schema.Struct({
  audio: Schema.optional(Schema.Literals(["on", "off"])),
  gbaSounds: Schema.optional(Schema.Boolean),
  quickDeath: Schema.optional(Schema.Boolean),
  playTimer: Schema.optional(Schema.Boolean),
  bgmVolume: Schema.optional(Volume),
  sfxVolume: Schema.optional(Volume),
  debug: Schema.optional(Schema.Boolean),
  metrics: Schema.optional(Schema.Boolean),
  viewport: Schema.optional(YfsViewportSettingsSchema),
  zoom: Schema.optional(YfsZoomSettingsSchema),
})

export type { YfsLauncherSettings }
export {
  resolveYfsViewport,
  resolveYfsZoomScale,
  stableSettingsKey,
  yfsSettingsQuery,
}

export function decodeYfsLauncherSettings(input: unknown): YfsLauncherSettings {
  return normalizeYfsLauncherSettings(input ?? {})
}
