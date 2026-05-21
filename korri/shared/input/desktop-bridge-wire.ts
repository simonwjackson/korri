import { Schema } from "effect"

export const DesktopInputSource = Schema.Literals([
  "keyboard",
  "gamepad",
  "pointer",
  "wheel",
  "native",
])

export const DesktopInputDirection = Schema.Literals([
  "up",
  "down",
  "left",
  "right",
])

export class DesktopInputDirectionAction extends Schema.Class<DesktopInputDirectionAction>(
  "DesktopInputDirectionAction",
)({
  type: Schema.Literal("direction"),
  direction: DesktopInputDirection,
  source: Schema.optional(DesktopInputSource),
}) {}

export class DesktopInputConfirmAction extends Schema.Class<DesktopInputConfirmAction>(
  "DesktopInputConfirmAction",
)({
  type: Schema.Literal("confirm"),
  source: Schema.optional(DesktopInputSource),
}) {}

export class DesktopInputBackAction extends Schema.Class<DesktopInputBackAction>(
  "DesktopInputBackAction",
)({
  type: Schema.Literal("back"),
  source: Schema.optional(DesktopInputSource),
}) {}

export class DesktopInputOptionsAction extends Schema.Class<DesktopInputOptionsAction>(
  "DesktopInputOptionsAction",
)({
  type: Schema.Literal("options"),
  source: Schema.optional(DesktopInputSource),
}) {}

export class DesktopInputMenuAction extends Schema.Class<DesktopInputMenuAction>(
  "DesktopInputMenuAction",
)({
  type: Schema.Literal("menu"),
  source: Schema.optional(DesktopInputSource),
}) {}

export class DesktopInputSystemAction extends Schema.Class<DesktopInputSystemAction>(
  "DesktopInputSystemAction",
)({
  type: Schema.Literal("system"),
  source: Schema.optional(DesktopInputSource),
}) {}

export const DesktopInputAction = Schema.Union([
  DesktopInputDirectionAction,
  DesktopInputConfirmAction,
  DesktopInputBackAction,
  DesktopInputOptionsAction,
  DesktopInputMenuAction,
  DesktopInputSystemAction,
])
export type DesktopInputAction = Schema.Schema.Type<typeof DesktopInputAction>

export const DesktopInputdConnectionStatus = Schema.Literals([
  "disabled",
  "connecting",
  "connected",
  "disconnected",
  "error",
])

export class DesktopInputStatus extends Schema.Class<DesktopInputStatus>(
  "DesktopInputStatus",
)({
  inputd: DesktopInputdConnectionStatus,
  active: Schema.Boolean,
  decodedFrames: Schema.Number,
  emittedActions: Schema.Number,
  droppedActions: Schema.Number,
  pushFailures: Schema.Number,
  lastError: Schema.Union([Schema.String, Schema.Null]),
}) {}

export class DesktopInputActionBridgePayload extends Schema.Class<DesktopInputActionBridgePayload>(
  "DesktopInputActionBridgePayload",
)({
  kind: Schema.Literal("korri.input.action"),
  sequence: Schema.Number,
  timestamp: Schema.Number,
  action: DesktopInputAction,
}) {}

export class DesktopInputStatusBridgePayload extends Schema.Class<DesktopInputStatusBridgePayload>(
  "DesktopInputStatusBridgePayload",
)({
  kind: Schema.Literal("korri.input.status"),
  status: DesktopInputStatus,
}) {}

export const DesktopInputBridgePayload = Schema.Union([
  DesktopInputActionBridgePayload,
  DesktopInputStatusBridgePayload,
])
export type DesktopInputBridgePayload = Schema.Schema.Type<
  typeof DesktopInputBridgePayload
>

export const decodeDesktopInputBridgePayload = Schema.decodeUnknownSync(
  DesktopInputBridgePayload,
)
export const encodeDesktopInputActionBridgePayload = Schema.encodeSync(
  DesktopInputActionBridgePayload,
)
export const encodeDesktopInputStatusBridgePayload = Schema.encodeSync(
  DesktopInputStatusBridgePayload,
)

export function isDesktopInputActionBridgePayload(
  value: unknown,
): value is DesktopInputActionBridgePayload {
  try {
    decodeDesktopInputBridgePayload(value)
    return isObject(value) && value.kind === "korri.input.action"
  } catch {
    return false
  }
}

export function isDesktopInputStatusBridgePayload(
  value: unknown,
): value is DesktopInputStatusBridgePayload {
  try {
    decodeDesktopInputBridgePayload(value)
    return isObject(value) && value.kind === "korri.input.status"
  } catch {
    return false
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
