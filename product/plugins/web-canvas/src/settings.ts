import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

// Canvas-game presentation settings. All optional — a canvas game's defaults
// (auto-fit the canvas, pixel scaling, auto-clear the start gate) need no config.
export const CanvasSettings = Schema.Struct({
  // letterbox/pillarbox color around the canvas.
  background: Schema.optional(Schema.String),
  // OPTIONAL render-resolution override. Default reads the canvas in-page;
  // useful mainly for responsive engines (Unity/Construct) which have no fixed
  // native res, and for performance downscaling.
  resolution: Schema.optional(
    Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  ),
  // image-rendering for the upscale.
  scaling: Schema.optional(Schema.Literals(["pixel", "smooth"])),
  // how the canvas fills the viewport.
  fit: Schema.optional(Schema.Literals(["contain", "cover", "stretch"])),
  // display rotation (portrait games on a landscape handheld, etc.).
  rotate: Schema.optional(Schema.Literals([0, 90, 180, 270])),
  // auto-click the start gate, or leave it.
  gate: Schema.optional(Schema.Literals(["auto", "none"])),
  // app-specific startup automation scripts (e.g. a level loader).
  shim: Schema.optional(Schema.Array(Schema.String)),
})
export type CanvasSettings = Schema.Schema.Type<typeof CanvasSettings>

export function decodeCanvasSettings(input: unknown): CanvasSettings {
  return Schema.decodeUnknownSync(CanvasSettings)(input ?? {}, STRICT)
}
