import { STREAM_CONTROL_LIMITS } from "@platform/stream-control/limits"
import { Schema } from "effect"

const numberRange = (min: number, max: number, label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value >= min && value <= max
      ? undefined
      : `${label} between ${min} and ${max} required`,
  )

export const RuntimeBitrateKbps = Schema.Number.check(
  numberRange(
    STREAM_CONTROL_LIMITS.bitrateKbps.min,
    STREAM_CONTROL_LIMITS.bitrateKbps.max,
    "bitrateKbps",
  ),
)
export const RuntimeFps = Schema.Number.check(numberRange(30, 120, "fps"))
export const RuntimeMoonlightResolutionWidth = Schema.Number.check(
  numberRange(
    STREAM_CONTROL_LIMITS.resolution.width.min,
    STREAM_CONTROL_LIMITS.resolution.width.max,
    "width",
  ),
)
export const RuntimeMoonlightResolutionHeight = Schema.Number.check(
  numberRange(
    STREAM_CONTROL_LIMITS.resolution.height.min,
    STREAM_CONTROL_LIMITS.resolution.height.max,
    "height",
  ),
)
export const RuntimeBrightnessPercent = Schema.Number.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= 0 && value <= 100
      ? undefined
      : "percent between 0 and 100 (integer) required",
  ),
)

export const EmptyPayloadFields = {}

const PluginConfigEntry = Schema.Struct({ enabled: Schema.Boolean })

export const StreamControlConfigResponseFields = {
  moonlight: Schema.Struct({ enabled: Schema.Boolean }),
  brightness: Schema.Struct({ enabled: Schema.Boolean }),
  battery: Schema.Struct({ enabled: Schema.Boolean }),
  plugins: Schema.Record(Schema.String, PluginConfigEntry),
  artifactDir: Schema.Union([Schema.String, Schema.Null]),
}

const StreamControlConfigResponseSchema = Schema.Struct(
  StreamControlConfigResponseFields,
)
export type StreamControlConfigResponseData = Schema.Schema.Type<
  typeof StreamControlConfigResponseSchema
>

const ControlValueSpec = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("range"),
    min: Schema.Number,
    max: Schema.Number,
    step: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal("steps"),
    values: Schema.Array(Schema.Number),
  }),
  Schema.Struct({
    kind: Schema.Literal("options"),
    values: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("resolutions"),
    values: Schema.Array(
      Schema.Struct({
        label: Schema.String,
        width: Schema.Number,
        height: Schema.Number,
      }),
    ),
  }),
  Schema.Struct({ kind: Schema.Literal("read-only") }),
])

const StreamControlCapability = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  subsystem: Schema.String,
  provider: Schema.optional(Schema.String),
  access: Schema.Literals(["read-write", "read-only"]),
  status: Schema.Literals(["supported", "unsupported"]),
  unavailableReason: Schema.Union([Schema.String, Schema.Null]),
  action: Schema.Union([Schema.String, Schema.Null]),
  readback: Schema.String,
  value: ControlValueSpec,
})

export const StreamControlControlsResponseFields = {
  controls: Schema.Array(StreamControlCapability),
}

const StreamControlControlsResponseSchema = Schema.Struct(
  StreamControlControlsResponseFields,
)
export type StreamControlControlsResponseData = Schema.Schema.Type<
  typeof StreamControlControlsResponseSchema
>

const ResolutionReadback = Schema.Struct({
  width: Schema.Number,
  height: Schema.Number,
})

const MoonlightStateReadback = Schema.Struct({
  bitrateKbps: Schema.Union([Schema.Number, Schema.Null]),
  fps: Schema.Union([Schema.Number, Schema.Null]),
  resolution: Schema.Union([ResolutionReadback, Schema.Null]),
})

const BrightnessDeviceReadback = Schema.Struct({
  name: Schema.String,
  brightness: Schema.Number,
  maxBrightness: Schema.Number,
  percent: Schema.Number,
})

const BrightnessStateReadback = Schema.Struct({
  devices: Schema.Array(BrightnessDeviceReadback),
  percent: Schema.Union([Schema.Number, Schema.Null]),
})

const PowerSupplyReadback = Schema.Struct({
  name: Schema.String,
  type: Schema.Union([Schema.String, Schema.Null]),
  status: Schema.Union([Schema.String, Schema.Null]),
  capacity: Schema.Union([Schema.Number, Schema.Null]),
  online: Schema.Union([Schema.Boolean, Schema.Null]),
  voltageNow: Schema.Union([Schema.Number, Schema.Null]),
  currentNow: Schema.Union([Schema.Number, Schema.Null]),
  powerNow: Schema.Union([Schema.Number, Schema.Null]),
  modelName: Schema.Union([Schema.String, Schema.Null]),
})

const BatteryStateReadback = Schema.Struct({
  percent: Schema.Union([Schema.Number, Schema.Null]),
  status: Schema.Union([Schema.String, Schema.Null]),
  supplies: Schema.Array(PowerSupplyReadback),
})

const DisabledStateEntry = Schema.Struct({ status: Schema.Literal("disabled") })
const ErrorStateEntry = Schema.Struct({
  status: Schema.Literal("error"),
  error: Schema.String,
})
const UnknownOkStateEntry = Schema.Struct({
  status: Schema.Literal("ok"),
  readback: Schema.Record(Schema.String, Schema.Unknown),
})

export const StreamControlStateResponseFields = {
  moonlight: Schema.Union([
    DisabledStateEntry,
    Schema.Struct({
      status: Schema.Literal("ok"),
      readback: MoonlightStateReadback,
    }),
    ErrorStateEntry,
  ]),
  brightness: Schema.Union([
    DisabledStateEntry,
    Schema.Struct({
      status: Schema.Literal("ok"),
      readback: BrightnessStateReadback,
    }),
    ErrorStateEntry,
  ]),
  battery: Schema.Union([
    DisabledStateEntry,
    Schema.Struct({
      status: Schema.Literal("ok"),
      readback: BatteryStateReadback,
    }),
    ErrorStateEntry,
  ]),
  plugins: Schema.Record(
    Schema.String,
    Schema.Union([DisabledStateEntry, UnknownOkStateEntry, ErrorStateEntry]),
  ),
}

const StreamControlStateResponseSchema = Schema.Struct(
  StreamControlStateResponseFields,
)
export type StreamControlStateResponseData = Schema.Schema.Type<
  typeof StreamControlStateResponseSchema
>

export const StreamControlRequestedPayload = Schema.Record(
  Schema.String,
  Schema.Unknown,
)
export type StreamControlRequestedPayload = Schema.Schema.Type<
  typeof StreamControlRequestedPayload
>

const StreamControlCommandOutcome = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("single"),
    status: Schema.Literal("applied"),
  }),
  Schema.Struct({
    kind: Schema.Literal("single"),
    status: Schema.Literal("pending"),
  }),
  Schema.Struct({
    kind: Schema.Literal("single"),
    status: Schema.Literal("failed"),
    error: Schema.String,
  }),
])

export const StreamControlCommandResponseFields = {
  action: Schema.String,
  requested: StreamControlRequestedPayload,
  outcome: Schema.optional(StreamControlCommandOutcome),
  response: Schema.Unknown,
  diagnosticError: Schema.optional(Schema.String),
}

const StreamControlCommandResponseSchema = Schema.Struct(
  StreamControlCommandResponseFields,
)
export type StreamControlCommandResponseData = Schema.Schema.Type<
  typeof StreamControlCommandResponseSchema
>
