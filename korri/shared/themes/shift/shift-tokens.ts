import { Schema } from "effect"

const RgbChannel = Schema.Number.pipe(Schema.int(), Schema.between(0, 255))

export const RgbColor = Schema.Struct({
  r: RgbChannel,
  g: RgbChannel,
  b: RgbChannel,
})
export type RgbColor = Schema.Schema.Type<typeof RgbColor>

export const ThemeColorMode = Schema.Struct({
  background: RgbColor,
  foreground: RgbColor,
  foregroundMuted: RgbColor,
  border: RgbColor,
})
export type ThemeColorMode = Schema.Schema.Type<typeof ThemeColorMode>

export const ThemeMotion = Schema.Struct({
  durationFast: Schema.String,
  durationBase: Schema.String,
  easingStandard: Schema.String,
})
export type ThemeMotion = Schema.Schema.Type<typeof ThemeMotion>

export const ThemeTokens = Schema.Struct({
  name: Schema.String,
  fontSans: Schema.String,
  modes: Schema.Struct({
    light: ThemeColorMode,
    dark: ThemeColorMode,
  }),
  motion: ThemeMotion,
})
export type ThemeTokens = Schema.Schema.Type<typeof ThemeTokens>

export const shiftTokens: ThemeTokens = {
  name: "shift",
  fontSans: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
  modes: {
    light: {
      background: { r: 255, g: 255, b: 255 },
      foreground: { r: 23, g: 23, b: 23 },
      foregroundMuted: { r: 82, g: 82, b: 82 },
      border: { r: 212, g: 212, b: 212 },
    },
    dark: {
      background: { r: 23, g: 23, b: 23 },
      foreground: { r: 255, g: 255, b: 255 },
      foregroundMuted: { r: 163, g: 163, b: 163 },
      border: { r: 38, g: 38, b: 38 },
    },
  },
  motion: {
    durationFast: "150ms",
    durationBase: "200ms",
    easingStandard: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
}

// Decode at module load so token mismatches surface immediately.
Schema.decodeUnknownSync(ThemeTokens)(shiftTokens)
