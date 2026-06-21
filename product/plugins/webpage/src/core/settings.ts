import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

// Universal, content-agnostic webpage settings. No canvas/game assumptions.
export const WebpageSettings = Schema.Struct({
  // audio policy: on (autoplay allowed), muted (start muted), gesture (require a
  // user gesture before audio — the browser default).
  audio: Schema.optional(Schema.Literals(["on", "muted", "gesture"])),
  // keep the Chromium profile (localStorage/IndexedDB) across launches so web
  // games/apps retain saves; ephemeral uses a throwaway profile.
  saves: Schema.optional(Schema.Literals(["persist", "ephemeral"])),
  userAgent: Schema.optional(Schema.String),
})
export type WebpageSettings = Schema.Schema.Type<typeof WebpageSettings>

export function decodeWebpageSettings(input: unknown): WebpageSettings {
  return Schema.decodeUnknownSync(WebpageSettings)(input ?? {}, STRICT)
}
