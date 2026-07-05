import { errorMessage } from "@platform/stream-control/runtime-support"
import {
  deviceStateFromFacts,
  deviceStatesEqual,
  failedBatteryReadState,
  failedNetworkReadState,
  normalizeBatterySnapshot,
  normalizeNetworkSnapshot,
  unknownDeviceState,
  type DeviceState as DeviceStateValue,
  type RawNetworkSnapshot,
} from "@platform/device/device-facts"
import {
  Context,
  Duration,
  Effect,
  Layer,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect"
import {
  createDeviceControlService,
  type BatterySnapshot,
} from "../stream-control/device-control-service"
import { createDeviceNetworkReader } from "./device-network-reader"

export type DeviceStateRefreshFact = "battery" | "network"

export interface DeviceStateRefreshResult {
  readonly accepted: true
  readonly facts: readonly DeviceStateRefreshFact[]
  readonly state: DeviceStateValue
}

export interface DeviceStateService {
  readonly current: () => Effect.Effect<DeviceStateValue>
  readonly changes: Stream.Stream<DeviceStateValue>
  readonly refresh: () => Effect.Effect<DeviceStateRefreshResult>
}

export class DeviceState extends Context.Service<
  DeviceState,
  DeviceStateService
>()("DeviceState") {}

export interface DeviceStateLayerOptions {
  readonly readBattery?: () => Promise<BatterySnapshot>
  readonly readNetwork?: () => Promise<RawNetworkSnapshot>
  readonly now?: () => Date
  readonly startBackground?: boolean
  readonly pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 30_000

export function makeDeviceStateLayer(options: DeviceStateLayerOptions = {}) {
  return Layer.effect(DeviceState)(makeDeviceStateService(options))
}

export const DeviceStateLayerLive = Layer.effect(DeviceState)(
  Effect.promise(() => getLiveDeviceStateService()),
)

let liveDeviceStateService: Promise<DeviceStateService> | undefined
const liveDeviceStateScope = Scope.makeUnsafe()

export function getLiveDeviceStateService(): Promise<DeviceStateService> {
  liveDeviceStateService ??= Effect.runPromise(
    makeDeviceStateService({ startBackground: true }).pipe(
      Effect.provideService(Scope.Scope, liveDeviceStateScope),
    ),
  )
  return liveDeviceStateService
}

function makeDeviceStateService(options: DeviceStateLayerOptions) {
  return Effect.gen(function* () {
    const now = options.now ?? (() => new Date())
    const readBattery =
      options.readBattery ??
      (() =>
        createDeviceControlService({
          powerSupplyDir:
            process.env.KORRI_POWER_SUPPLY_DIR ?? "/sys/class/power_supply",
        }).readBattery())
    const readNetwork =
      options.readNetwork ??
      (() =>
        createDeviceNetworkReader({
          netDir: process.env.KORRI_NET_IFACE_DIR ?? "/sys/class/net",
          ...(process.env.KORRI_NET_IFACE
            ? { iface: process.env.KORRI_NET_IFACE }
            : {}),
        }).readNetwork())
    const ref = yield* SubscriptionRef.make<DeviceStateValue>(
      unknownDeviceState(now().toISOString()),
    )

    const refreshOnce = () =>
      Effect.gen(function* () {
        const previous = yield* SubscriptionRef.get(ref)
        const observedAt = now().toISOString()
        const battery = yield* Effect.tryPromise({
          try: () => readBattery(),
          catch: error => error,
        }).pipe(
          Effect.match({
            onSuccess: snapshot => normalizeBatterySnapshot(snapshot, observedAt),
            onFailure: error =>
              failedBatteryReadState(previous.battery, error, observedAt),
          }),
        )
        const network = yield* Effect.tryPromise({
          try: () => readNetwork(),
          catch: error => error,
        }).pipe(
          Effect.match({
            onSuccess: snapshot => normalizeNetworkSnapshot(snapshot, observedAt),
            onFailure: error =>
              failedNetworkReadState(previous.network, error, observedAt),
          }),
        )
        const next = deviceStateFromFacts({ battery, network, observedAt })
        if (!deviceStatesEqual(previous, next)) {
          yield* SubscriptionRef.set(ref, next)
        }
        return {
          accepted: true as const,
          facts: ["battery", "network"] as const,
          state: next,
        }
      })

    let refreshTail = Promise.resolve()
    const refresh = () =>
      Effect.promise(() => {
        const run = refreshTail.then(
          () => Effect.runPromise(refreshOnce()),
          () => Effect.runPromise(refreshOnce()),
        )
        refreshTail = run.then(
          () => undefined,
          () => undefined,
        )
        return run
      })

    yield* refresh().pipe(
      Effect.catch(error =>
        SubscriptionRef.set(
          ref,
          deviceStateFromFacts({
            battery: failedBatteryReadState(
              unknownDeviceState(now().toISOString()).battery,
              errorMessage(error),
              now().toISOString(),
            ),
            network: { _tag: "Unknown", observedAt: now().toISOString() },
          }),
        ),
      ),
    )

    if (options.startBackground !== false) {
      const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
      yield* Effect.sleep(Duration.millis(intervalMs)).pipe(
        Effect.andThen(refresh()),
        Effect.forever,
        Effect.forkScoped,
      )
    }

    return {
      current: () => SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
      refresh,
    }
  })
}
