import { MOONLIGHT_CONTROL_PROTOCOL_LIMITS } from "@platform/stream/moonlight-control-protocol"
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
  subsystem: Schema.Literals([
    "moonlight",
    "gamescope",
    "linked",
    "brightness",
    "battery",
  ]),
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

const GamescopeStateReadback = Schema.Struct({
  fps: Schema.Union([Schema.Number, Schema.Null]),
  resolution: Schema.Union([ResolutionReadback, Schema.Null]),
  sharpness: Schema.Union([Schema.Number, Schema.Null]),
  filter: Schema.Union([GamescopeScalingFilter, Schema.Null]),
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

export const StreamControlStateResponseFields = {
  moonlight: Schema.Union([
    DisabledStateEntry,
    Schema.Struct({
      status: Schema.Literal("ok"),
      readback: MoonlightStateReadback,
    }),
    ErrorStateEntry,
  ]),
  gamescope: Schema.Union([
    DisabledStateEntry,
    Schema.Struct({
      status: Schema.Literal("ok"),
      readback: GamescopeStateReadback,
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

const CommandTargetOutcome = Schema.Union([
  Schema.Struct({ status: Schema.Literal("applied") }),
  Schema.Struct({ status: Schema.Literal("pending") }),
  Schema.Struct({ status: Schema.Literal("failed"), error: Schema.String }),
])

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
  Schema.Struct({
    kind: Schema.Literal("linked"),
    status: Schema.Literals(["applied", "pending", "partial", "failed"]),
    moonlight: CommandTargetOutcome,
    gamescope: CommandTargetOutcome,
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
