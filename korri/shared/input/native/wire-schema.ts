import { Schema } from "effect"

export const NativeInputDeviceClass = Schema.Literals([
  "gamepad",
  "keyboard",
  "mouse",
  "touch",
  "system",
  "unknown",
])
export type NativeInputDeviceClass = Schema.Schema.Type<
  typeof NativeInputDeviceClass
>

export class NativeInputDeviceInfo extends Schema.Class<NativeInputDeviceInfo>(
  "NativeInputDeviceInfo",
)({
  deviceId: Schema.String,
  class: NativeInputDeviceClass,
  name: Schema.String,
  capabilities: Schema.Array(Schema.String),
}) {}

export class NativeInputInput extends Schema.Class<NativeInputInput>(
  "NativeInputInput",
)({
  kind: Schema.Literal("input"),
  deviceId: Schema.String,
  class: NativeInputDeviceClass,
  type: Schema.Number,
  code: Schema.Number,
  value: Schema.Number,
  timestamp: Schema.Number,
}) {}

export class NativeInputDeviceAdded extends Schema.Class<NativeInputDeviceAdded>(
  "NativeInputDeviceAdded",
)({
  kind: Schema.Literal("device-added"),
  device: NativeInputDeviceInfo,
}) {}

export class NativeInputDeviceRemoved extends Schema.Class<NativeInputDeviceRemoved>(
  "NativeInputDeviceRemoved",
)({
  kind: Schema.Literal("device-removed"),
  deviceId: Schema.String,
}) {}

export const NativeInputEvent = Schema.Union([
  NativeInputInput,
  NativeInputDeviceAdded,
  NativeInputDeviceRemoved,
])
export type NativeInputEvent = Schema.Schema.Type<typeof NativeInputEvent>

export class NativeInputSubscription extends Schema.Class<NativeInputSubscription>(
  "NativeInputSubscription",
)({
  classes: Schema.Array(NativeInputDeviceClass),
}) {}

export const decodeNativeInputEvent = Schema.decodeUnknownSync(NativeInputEvent)
export const encodeNativeInputEvent = Schema.encodeSync(NativeInputEvent)

export const decodeNativeInputSubscription = Schema.decodeUnknownSync(
  NativeInputSubscription,
)
export const encodeNativeInputSubscription = Schema.encodeSync(
  NativeInputSubscription,
)
