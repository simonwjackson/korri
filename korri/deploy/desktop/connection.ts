import { Clock, Effect, Stream, SubscriptionRef } from "effect"
import type { Scope } from "effect/Scope"
import type {
  StreamHostCandidate,
  StreamHostEvent,
} from "../../../tools/cli/lan-stream-discovery"
import type { DesktopConfig } from "./desktop-config"

export interface ServerRecord {
  readonly hostId: string
  readonly controlUrl: string
}

export type ConnectionState =
  | {
      readonly status: "searching"
      readonly since: Date
      readonly helpAfter: Date
    }
  | {
      readonly status: "reconnecting"
      readonly server: ServerRecord
      readonly since: Date
      readonly helpAfter: Date
    }
  | {
      readonly status: "connected"
      readonly server: ServerRecord
    }

export interface ConnectionControllerDeps {
  /** Continuous mDNS browse stream (e.g. `watchStreamHosts(...)`). */
  readonly watcher: Stream.Stream<StreamHostEvent>
  /** Loads `desktop.yaml` once at startup. */
  readonly loadConfig: Effect.Effect<DesktopConfig, unknown>
  /** Persists the connected server back to `desktop.yaml`. */
  readonly saveConfig: (
    partial: Partial<DesktopConfig>,
  ) => Effect.Effect<void, unknown>
  /**
   * Health probe: returns `true` if `<controlUrl>/api/health` answers within
   * the implementation timeout, `false` otherwise. Must not throw.
   */
  readonly httpProbe: (controlUrl: string) => Effect.Effect<boolean>
  /** Override the "prefer remembered" window. Default: 1500ms. */
  readonly windowDurationMs?: number
  /** Override the help-text delay. Default: 30000ms. */
  readonly helpDelayMs?: number
}

export interface ConnectionController {
  readonly state: SubscriptionRef.SubscriptionRef<ConnectionState>
}

const DEFAULT_WINDOW_MS = 1500
const DEFAULT_HELP_DELAY_MS = 30_000

export function makeConnectionController(
  deps: ConnectionControllerDeps,
): Effect.Effect<ConnectionController, never, Scope> {
  const windowDurationMs = deps.windowDurationMs ?? DEFAULT_WINDOW_MS
  const helpDelayMs = deps.helpDelayMs ?? DEFAULT_HELP_DELAY_MS

  return Effect.gen(function* () {
    const config = (yield* Effect.orElseSucceed(
      deps.loadConfig,
      () => ({}) as DesktopConfig,
    )) as DesktopConfig
    const remembered = config.lastConnectedServer
    const now = yield* nowDate
    const helpAfter = new Date(now.getTime() + helpDelayMs)
    const initialState: ConnectionState = remembered
      ? {
          status: "reconnecting",
          server: remembered,
          since: now,
          helpAfter,
        }
      : { status: "searching", since: now, helpAfter }

    const state: SubscriptionRef.SubscriptionRef<ConnectionState> =
      yield* SubscriptionRef.make<ConnectionState>(initialState)

    // If we have a remembered server, fire a direct probe in parallel
    // with mDNS discovery. mDNS via bonjour-service can take seconds to
    // return its first candidate (slow on wifi or behind avahi-daemon);
    // a direct probe of the cached URL skips that delay when the server
    // is reachable at the same address it was last time. If the probe
    // fails we leave it to the mDNS-driven controller to find an
    // alternative.
    if (remembered) {
      yield* Effect.forkScoped(
        probeRememberedDirect({
          state,
          httpProbe: deps.httpProbe,
          saveConfig: deps.saveConfig,
          remembered,
        }),
      )
    }

    yield* Effect.forkScoped(
      runController({
        state,
        watcher: deps.watcher,
        httpProbe: deps.httpProbe,
        saveConfig: deps.saveConfig,
        remembered,
        windowDurationMs,
        helpDelayMs,
      }),
    )

    return { state }
  })
}

/**
 * Probe the remembered server's `/api/health` directly, bypassing mDNS.
 * On success, transition to `connected` and persist. Skips silently if
 * the controller has already connected via another path.
 */
function probeRememberedDirect(input: {
  readonly state: SubscriptionRef.SubscriptionRef<ConnectionState>
  readonly httpProbe: (controlUrl: string) => Effect.Effect<boolean>
  readonly saveConfig: (
    partial: Partial<DesktopConfig>,
  ) => Effect.Effect<void, unknown>
  readonly remembered: ServerRecord
}): Effect.Effect<void> {
  return Effect.gen(function* () {
    const ok = yield* input.httpProbe(input.remembered.controlUrl)
    if (!ok) return
    const current = yield* SubscriptionRef.get(input.state)
    if (current.status === "connected") return
    yield* SubscriptionRef.set(input.state, {
      status: "connected",
      server: input.remembered,
    })
    yield* Effect.orElseSucceed(
      input.saveConfig({ lastConnectedServer: input.remembered }),
      () => undefined,
    )
  })
}

interface ControllerContext {
  readonly state: SubscriptionRef.SubscriptionRef<ConnectionState>
  readonly watcher: Stream.Stream<StreamHostEvent>
  readonly httpProbe: (controlUrl: string) => Effect.Effect<boolean>
  readonly saveConfig: (
    partial: Partial<DesktopConfig>,
  ) => Effect.Effect<void, unknown>
  readonly remembered: ServerRecord | undefined
  readonly windowDurationMs: number
  readonly helpDelayMs: number
}

type ControllerEvent =
  | { readonly kind: "host"; readonly event: StreamHostEvent }
  | { readonly kind: "windowExpired" }

function runController(ctx: ControllerContext): Effect.Effect<void> {
  // Mutable, fiber-local state. Serialized by the single processor fiber.
  const local = {
    windowExpired: false,
    queued: new Map<string, StreamHostCandidate>(),
    connected: undefined as ServerRecord | undefined,
  }

  // Sync `local.connected` from the shared SubscriptionRef. The
  // direct-probe fiber (see `probeRememberedDirect`) sets the ref to
  // `connected` without touching this fiber's `local` map, so without
  // this hand-off the controller would keep thinking it's still
  // pre-connected and could (a) downgrade to searching when its 1.5s
  // window expires, or (b) duplicate-probe the same candidate.
  const syncConnectedFromRef = Effect.gen(function* () {
    if (local.connected) return true
    const current = yield* SubscriptionRef.get(ctx.state)
    if (current.status === "connected") {
      local.connected = current.server
      return true
    }
    return false
  })

  const handleEvent = (event: ControllerEvent): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (event.kind === "windowExpired") {
        local.windowExpired = true
        if (yield* syncConnectedFromRef) return
        // Promote first queued candidate, preferring remembered if present.
        const preferred = ctx.remembered
          ? local.queued.get(ctx.remembered.controlUrl)
          : undefined
        const candidate =
          preferred ?? local.queued.values().next().value
        if (candidate) {
          local.queued.delete(candidate.controlUrl)
          yield* attemptConnect(ctx, local, candidate)
        } else {
          // No queued candidates and window expired -> ensure not stuck in
          // reconnecting state forever; downgrade to searching so the UI
          // stops naming a server it hasn't seen.
          if (ctx.remembered) {
            const now = yield* nowDate
            const help = yield* helpAfterDate(ctx.helpDelayMs)
            yield* SubscriptionRef.set(ctx.state, {
              status: "searching",
              since: now,
              helpAfter: help,
            })
          }
        }
        return
      }

      const host = event.event
      if (host.kind === "disappear") {
        local.queued.delete(host.controlUrl)
        if (local.connected?.controlUrl === host.controlUrl) {
          local.connected = undefined
          const now = yield* nowDate
          const help = yield* helpAfterDate(ctx.helpDelayMs)
          // After a connection drops we go back to searching even if the
          // dropped server was remembered — federation can decide later
          // whether to surface that distinction.
          yield* SubscriptionRef.set(ctx.state, {
            status: "searching",
            since: now,
            helpAfter: help,
          })
        }
        return
      }

      // host.kind === "appear"
      const candidate = host.candidate
      if (yield* syncConnectedFromRef) {
        // Already connected (possibly via the direct-probe fiber);
        // ignore (federation will revisit this).
        return
      }
      if (
        ctx.remembered &&
        candidate.controlUrl === ctx.remembered.controlUrl
      ) {
        // Remembered always wins inside the window; outside the window it
        // also wins because it was the only thing we were waiting for.
        local.queued.delete(candidate.controlUrl)
        yield* attemptConnect(ctx, local, candidate)
        return
      }
      if (local.windowExpired) {
        yield* attemptConnect(ctx, local, candidate)
        return
      }
      // In window, non-remembered candidate: queue and keep waiting.
      local.queued.set(candidate.controlUrl, candidate)
    })

  const windowExpired: Stream.Stream<ControllerEvent> = Stream.fromEffect(
    Effect.sleep(`${ctx.windowDurationMs} millis`).pipe(
      Effect.as<ControllerEvent>({ kind: "windowExpired" }),
    ),
  )

  const hostEvents: Stream.Stream<ControllerEvent> = ctx.watcher.pipe(
    Stream.map(event => ({ kind: "host", event }) as ControllerEvent),
  )

  return Stream.merge(hostEvents, windowExpired).pipe(
    Stream.runForEach(handleEvent),
  )
}

function attemptConnect(
  ctx: ControllerContext,
  local: { connected: ServerRecord | undefined },
  candidate: StreamHostCandidate,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const ok = yield* ctx.httpProbe(candidate.controlUrl)
    if (!ok) return
    const server: ServerRecord = {
      hostId: candidate.id,
      controlUrl: candidate.controlUrl,
    }
    local.connected = server
    yield* SubscriptionRef.set(ctx.state, {
      status: "connected",
      server,
    })
    yield* Effect.orElseSucceed(
      ctx.saveConfig({ lastConnectedServer: server }),
      () => undefined,
    )
  })
}

const nowDate: Effect.Effect<Date> = Clock.currentTimeMillis.pipe(
  Effect.map(ms => new Date(ms)),
)

function helpAfterDate(delayMs: number): Effect.Effect<Date> {
  return Clock.currentTimeMillis.pipe(
    Effect.map(ms => new Date(ms + delayMs)),
  )
}
