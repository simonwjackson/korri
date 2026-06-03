import { MOONLIGHT_CONTROL_PROTOCOL_LIMITS } from "@shared/stream/moonlight-control-protocol"
import { Schema } from "effect"

const numberRange = (min: number, max: number, label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value >= min && value <= max
      ? undefined
      : `${label} between ${min} and ${max} required`,
  )

const positiveNumberRange = (min: number, max: number, label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value > min && value <= max
      ? undefined
      : `${label} greater than ${min} and at most ${max} required`,
  )

export const RuntimeBitrateKbps = Schema.Number.check(
  numberRange(
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.bitrateKbps.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.bitrateKbps.max,
    "bitrateKbps",
  ),
)
export const RuntimeFps = Schema.Number.check(numberRange(30, 120, "fps"))
// Gamescope runtime FPS limiter: 0 disables the limit, 240 is the upper sanity
// bound. Accept integers only — the GAMESCOPE_LIMITER_FILE writer parses with
// strtol and floats would round in ways the operator did not request.
export const RuntimeGamescopeFps = Schema.Number.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= 0 && value <= 240
      ? undefined
      : "fps between 0 and 240 (integer) required",
  ),
)
export const RuntimeMoonlightResolutionWidth = Schema.Number.check(
  numberRange(
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.width.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.width.max,
    "width",
  ),
)
export const RuntimeMoonlightResolutionHeight = Schema.Number.check(
  numberRange(
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.height.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.height.max,
    "height",
  ),
)
export const RuntimeGamescopeResolutionDimension = Schema.Number.check(
  positiveNumberRange(0, 16_384, "dimension"),
)
export const RuntimeSharpness = Schema.Number.check(
  numberRange(0, 20, "sharpness"),
)
export const RuntimeBrightnessPercent = Schema.Number.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= 0 && value <= 100
      ? undefined
      : "percent between 0 and 100 (integer) required",
  ),
)

export const GamescopeScalingFilter = Schema.Literals([
  "linear",
  "nearest",
  "integer",
  "fsr",
  "nis",
])

export const EmptyPayloadFields = {}

export const StreamControlConfigResponseFields = {
  moonlight: Schema.Struct({ enabled: Schema.Boolean }),
  gamescope: Schema.Struct({ enabled: Schema.Boolean }),
  brightness: Schema.Struct({ enabled: Schema.Boolean }),
  battery: Schema.Struct({ enabled: Schema.Boolean }),
  artifactDir: Schema.Union([Schema.String, Schema.Null]),
}

const StreamControlConfigResponseSchema = Schema.Struct(
  StreamControlConfigResponseFields,
)
export type StreamControlConfigResponseData = Schema.Schema.Type<
  typeof StreamControlConfigResponseSchema
>

const StreamControlStateEntry = Schema.Union([
  Schema.Struct({ status: Schema.Literal("disabled") }),
  Schema.Struct({ status: Schema.Literal("ok"), response: Schema.Unknown }),
  Schema.Struct({ status: Schema.Literal("error"), error: Schema.String }),
])

export const StreamControlStateResponseFields = {
  moonlight: StreamControlStateEntry,
  gamescope: StreamControlStateEntry,
  brightness: StreamControlStateEntry,
  battery: StreamControlStateEntry,
}

const StreamControlStateResponseSchema = Schema.Struct(
  StreamControlStateResponseFields,
)
export type StreamControlStateResponseData = Schema.Schema.Type<
  typeof StreamControlStateResponseSchema
>

const StreamControlRequestedPayload = Schema.Record(
  Schema.String,
  Schema.Unknown,
)
export type StreamControlRequestedPayload = Schema.Schema.Type<
  typeof StreamControlRequestedPayload
>

export const StreamControlCommandResponseFields = {
  action: Schema.String,
  requested: StreamControlRequestedPayload,
  response: Schema.Unknown,
  diagnosticError: Schema.optional(Schema.String),
}

const StreamControlCommandResponseSchema = Schema.Struct(
  StreamControlCommandResponseFields,
)
export type StreamControlCommandResponseData = Schema.Schema.Type<
  typeof StreamControlCommandResponseSchema
>
