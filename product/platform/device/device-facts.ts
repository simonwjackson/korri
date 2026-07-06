import { Schema } from "effect"

export const DevicePowerSupply = Schema.Struct({
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
export type DevicePowerSupply = Schema.Schema.Type<typeof DevicePowerSupply>

export const DeviceBatteryReady = Schema.Struct({
  _tag: Schema.Literal("Ready"),
  percent: Schema.Union([Schema.Number, Schema.Null]),
  status: Schema.Union([Schema.String, Schema.Null]),
  charging: Schema.Boolean,
  supplies: Schema.Array(DevicePowerSupply),
  observedAt: Schema.String,
})
export type DeviceBatteryReady = Schema.Schema.Type<typeof DeviceBatteryReady>

export const DeviceBatteryUnknown = Schema.Struct({
  _tag: Schema.Literal("Unknown"),
  observedAt: Schema.String,
})
export const DeviceBatteryNoBattery = Schema.Struct({
  _tag: Schema.Literal("NoBattery"),
  supplies: Schema.Array(DevicePowerSupply),
  observedAt: Schema.String,
})
export const DeviceBatteryReadError = Schema.Struct({
  _tag: Schema.Literal("ReadError"),
  message: Schema.String,
  observedAt: Schema.String,
})
export const DeviceBatteryStale = Schema.Struct({
  _tag: Schema.Literal("Stale"),
  lastKnown: DeviceBatteryReady,
  message: Schema.String,
  observedAt: Schema.String,
})

export const DeviceBatteryState = Schema.Union([
  DeviceBatteryUnknown,
  DeviceBatteryNoBattery,
  DeviceBatteryReady,
  DeviceBatteryStale,
  DeviceBatteryReadError,
])
export type DeviceBatteryState = Schema.Schema.Type<typeof DeviceBatteryState>

export const DeviceNetworkKind = Schema.Union([
  Schema.Literal("wifi"),
  Schema.Literal("ethernet"),
  Schema.Literal("unknown"),
])
export type DeviceNetworkKind = Schema.Schema.Type<typeof DeviceNetworkKind>

export const DeviceNetworkConnected = Schema.Struct({
  _tag: Schema.Literal("Connected"),
  kind: DeviceNetworkKind,
  name: Schema.Union([Schema.String, Schema.Null]),
  strengthPercent: Schema.Union([Schema.Number, Schema.Null]),
  observedAt: Schema.String,
})
export type DeviceNetworkConnected = Schema.Schema.Type<
  typeof DeviceNetworkConnected
>

export const DeviceNetworkDisconnected = Schema.Struct({
  _tag: Schema.Literal("Disconnected"),
  observedAt: Schema.String,
})
export type DeviceNetworkDisconnected = Schema.Schema.Type<
  typeof DeviceNetworkDisconnected
>

export const DeviceNetworkUnknown = Schema.Struct({
  _tag: Schema.Literal("Unknown"),
  observedAt: Schema.String,
})
export const DeviceNetworkReadError = Schema.Struct({
  _tag: Schema.Literal("ReadError"),
  message: Schema.String,
  observedAt: Schema.String,
})
export const DeviceNetworkStale = Schema.Struct({
  _tag: Schema.Literal("Stale"),
  lastKnown: Schema.Union([DeviceNetworkConnected, DeviceNetworkDisconnected]),
  message: Schema.String,
  observedAt: Schema.String,
})

export const DeviceNetworkState = Schema.Union([
  DeviceNetworkUnknown,
  DeviceNetworkConnected,
  DeviceNetworkDisconnected,
  DeviceNetworkStale,
  DeviceNetworkReadError,
])
export type DeviceNetworkState = Schema.Schema.Type<typeof DeviceNetworkState>

export const DeviceStateSchema = Schema.Struct({
  battery: DeviceBatteryState,
  network: DeviceNetworkState,
  observedAt: Schema.String,
})
export type DeviceState = Schema.Schema.Type<typeof DeviceStateSchema>

export interface RawBatterySnapshot {
  readonly percent: number | null
  readonly status: string | null
  readonly supplies: readonly DevicePowerSupply[]
}

export interface RawNetworkSnapshot {
  readonly connected: boolean | null
  readonly kind: DeviceNetworkKind | null
  readonly name?: string | null
  readonly strengthPercent: number | null
}

export function unknownDeviceState(
  observedAt = new Date().toISOString(),
): DeviceState {
  return {
    observedAt,
    battery: { _tag: "Unknown", observedAt },
    network: { _tag: "Unknown", observedAt },
  }
}

export function normalizeBatterySnapshot(
  snapshot: RawBatterySnapshot,
  observedAt = new Date().toISOString(),
): DeviceBatteryState {
  const supplies = snapshot.supplies.map(supply => ({ ...supply }))
  const hasBattery = supplies.some(supply => supply.type === "Battery")
  if (!hasBattery) return { _tag: "NoBattery", supplies, observedAt }
  return {
    _tag: "Ready",
    percent: normalizePercent(snapshot.percent),
    status: snapshot.status,
    charging: snapshot.status === "Charging",
    supplies,
    observedAt,
  }
}

export function normalizeNetworkSnapshot(
  snapshot: RawNetworkSnapshot,
  observedAt = new Date().toISOString(),
): DeviceNetworkState {
  if (snapshot.connected === null) return { _tag: "Unknown", observedAt }
  if (!snapshot.connected) return { _tag: "Disconnected", observedAt }
  return {
    _tag: "Connected",
    kind: snapshot.kind ?? "unknown",
    name: normalizeName(snapshot.name),
    strengthPercent: normalizePercent(snapshot.strengthPercent),
    observedAt,
  }
}

export function deviceStateFromBattery(
  battery: DeviceBatteryState,
  observedAt = battery.observedAt,
): DeviceState {
  return {
    observedAt,
    battery,
    network: { _tag: "Unknown", observedAt },
  }
}

export function deviceStateFromFacts({
  battery,
  network,
  observedAt,
}: {
  readonly battery: DeviceBatteryState
  readonly network: DeviceNetworkState
  readonly observedAt?: string
}): DeviceState {
  return {
    observedAt: observedAt ?? battery.observedAt,
    battery,
    network,
  }
}

export function failedBatteryReadState(
  previous: DeviceBatteryState,
  error: unknown,
  observedAt = new Date().toISOString(),
): DeviceBatteryState {
  const message = errorMessage(error)
  const lastKnown = lastKnownReadyBattery(previous)
  if (lastKnown) return { _tag: "Stale", lastKnown, message, observedAt }
  return { _tag: "ReadError", message, observedAt }
}

export function failedNetworkReadState(
  previous: DeviceNetworkState,
  error: unknown,
  observedAt = new Date().toISOString(),
): DeviceNetworkState {
  const message = errorMessage(error)
  const lastKnown = lastKnownReadyNetwork(previous)
  if (lastKnown) return { _tag: "Stale", lastKnown, message, observedAt }
  return { _tag: "ReadError", message, observedAt }
}

export function deviceStatesEqual(a: DeviceState, b: DeviceState): boolean {
  return (
    JSON.stringify(stripObservedAt(a)) === JSON.stringify(stripObservedAt(b))
  )
}

export function batteryReadyForStreamControl(
  state: DeviceBatteryState,
): RawBatterySnapshot | undefined {
  const ready = lastKnownReadyBattery(state)
  if (!ready) return undefined
  return {
    percent: ready.percent,
    status: ready.status,
    supplies: ready.supplies,
  }
}

function lastKnownReadyBattery(
  state: DeviceBatteryState,
): DeviceBatteryReady | undefined {
  if (state._tag === "Ready") return state
  if (state._tag === "Stale") return state.lastKnown
  return undefined
}

function lastKnownReadyNetwork(
  state: DeviceNetworkState,
): DeviceNetworkConnected | DeviceNetworkDisconnected | undefined {
  if (state._tag === "Connected" || state._tag === "Disconnected") return state
  if (state._tag === "Stale") return state.lastKnown
  return undefined
}

function normalizePercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeName(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stripObservedAt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripObservedAt)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "observedAt")
      .map(([key, entry]) => [key, stripObservedAt(entry)]),
  )
}
