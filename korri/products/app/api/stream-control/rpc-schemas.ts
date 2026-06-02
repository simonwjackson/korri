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
  positiveNumberRange(0, 100_000, "bitrateKbps"),
)
export const RuntimeFps = Schema.Number.check(numberRange(30, 120, "fps"))
export const RuntimeResolutionDimension = Schema.Number.check(
  positiveNumberRange(0, 16_384, "dimension"),
)
export const RuntimeSharpness = Schema.Number.check(
  numberRange(0, 20, "sharpness"),
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
