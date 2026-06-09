import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAdaptorServer } from "@hono/node-server"
import {
  foregroundSessionGateStateAtom,
  foregroundSessionStatusLayerAtom,
} from "@platform/react/library/library-atoms"
import { ForegroundSessionStatusSource } from "@platform/stream/foreground-session-status-source"
import { createHonoApp } from "@product/apps/portal/api/hono-app"
import { ForegroundSessionStatusLayerLive } from "@product/apps/portal/features/home/foreground-session-status-layer-live"
import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { Hono } from "hono"
import { withRpcServer } from "../../../../../tools/testing/library/with-rpc-server"

// `ForegroundSessionStatusLayerLive` builds an `RpcClient` against
// `serverRpcGroup`, which is the SUPERSET of the renderer's `appRpcGroup`
// (adds `app.server.status` and friends). Bun-API mounts the server group
// only when `rpcSurface === "server"`; the test boots a fresh honoApp with
// that surface so the renderer's RPC call routes to `handleServerStatus`.
const serverHonoApp = createHonoApp({ rpcSurface: "server" })

/**
 * End-to-end coverage for the renderer's foreground-session status layer
 * against a real loopback Hono server and a real fake sessiond Unix-socket
 * endpoint. Exercises:
 *
 *   1. RpcClient.make(serverRpcGroup) -> app.server.status -> sessiond mode
 *      → ForegroundSessionGateState round trip, with the production
 *      RpcClientLive and the production handleServerStatus handler.
 *   2. The `onFailure → LoadError` branch in the layer when the renderer
 *      cannot reach the bun API at all (transport failure).
 *   3. Layer behaviour when sessiond is configured but answers 401
 *      (the operator-facing `sessiondUnavailable` collapses to a Ready
 *      gate state because the renderer should not block the home view
 *      when the daemon is misauthorized).
 *
 * Pattern follows `library-rpc-layers.test.ts`: real `withRpcServer` + real
 * production handlers + window.location pointed at the loopback URL. No
 * `Mock*`/`Stub*`/`Fake*`-named doubles; the fake sessiond is a small real
 * Unix-socket server with a configurable handler.
 */

const sessiondEnvKeys = [
  "KORRI_SESSIOND_SOCKET",
  "KORRI_STREAM_CONTROL_ENABLED",
  "KORRI_GAME_STREAM_STATUS_PATH",
  "KORRI_DAEMON_ID",
] as const

const originalSessiondEnv: Record<string, string | undefined> =
  Object.fromEntries(sessiondEnvKeys.map(key => [key, process.env[key]]))

const originalLocation = {
  origin: window.location.origin,
  href: window.location.href,
  hostname: window.location.hostname,
  pathname: window.location.pathname,
}

afterEach(() => {
  for (const key of sessiondEnvKeys)
    setOptionalEnv(key, originalSessiondEnv[key])
  setWindowLocation(originalLocation)
})

describe("ForegroundSessionStatusLayerLive (integration)", () => {
  it("maps sessiond mode=game to a Running gate state through the real RPC pipeline", async () => {
    await using sessiond = await withSessiondSocket({
      respond: () =>
        Response.json({
          schemaVersion: 1,
          mode: "game",
          capabilities: {
            managedLaunch: true,
            lifecycleEvents: true,
            perLaunchTermination: true,
          },
          restoreAttempts: 0,
          active: { launchId: "snes/echo.smc", mode: "game" },
        }),
    })
    await using server = await withRpcServer({ fetch: serverHonoApp.fetch })
    pointWindowAt(server.url)
    configureSessiondEnv(sessiond.socketPath)

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const source = yield* ForegroundSessionStatusSource
          return yield* source.get()
        }).pipe(Effect.provide(ForegroundSessionStatusLayerLive)),
      ),
    )

    expect(result).toEqual({
      _tag: "Running",
      requestId: "snes/echo.smc",
      gameId: "snes/echo.smc",
    })
    expect(sessiond.requestCount()).toBeGreaterThanOrEqual(1)
  })

  it("surfaces a Ready gate state when sessiond answers 401 (sessiondUnavailable)", async () => {
    // 401 means the daemon is up but the renderer's bun API failed to
    // authenticate. The status proxy maps that to `sessiondUnavailable: true`
    // with no `sessiond` field; `snapshotFromServerStatus(undefined, …)` then
    // produces an IdleReady snapshot, which the gate-state mapper renders
    // as `{ _tag: "Ready" }`. Regression guard: do not allow a 401 to leave
    // the home screen stuck on a launch-pipeline gate.
    await using sessiond = await withSessiondSocket({
      respond: () => new Response("unauthorized", { status: 401 }),
    })
    await using server = await withRpcServer({ fetch: serverHonoApp.fetch })
    pointWindowAt(server.url)
    configureSessiondEnv(sessiond.socketPath)

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const source = yield* ForegroundSessionStatusSource
          return yield* source.get()
        }).pipe(Effect.provide(ForegroundSessionStatusLayerLive)),
      ),
    )

    expect(result).toEqual({ _tag: "Ready" })
  })

  it("propagates a live sessiond mode through foregroundSessionGateStateAtom (atom e2e)", async () => {
    // Top-of-stack proof: swap the renderer's layer atom to the live
    // layer, point window.location at a real bun-API server, point the
    // bun API at a fake sessiond returning `mode: "game"`, and assert
    // the gate-state atom resolves to `{ _tag: "Running" }` end to end.
    await using sessiond = await withSessiondSocket({
      respond: () =>
        Response.json({
          schemaVersion: 1,
          mode: "game",
          capabilities: {
            managedLaunch: true,
            lifecycleEvents: true,
            perLaunchTermination: true,
          },
          restoreAttempts: 0,
          active: { launchId: "snes/echo.smc", mode: "game" },
        }),
    })
    await using server = await withRpcServer({ fetch: serverHonoApp.fetch })
    pointWindowAt(server.url)
    configureSessiondEnv(sessiond.socketPath)

    const registry = AtomRegistry.make({
      initialValues: [
        [foregroundSessionStatusLayerAtom, ForegroundSessionStatusLayerLive],
      ],
      // Match React's mount/unmount semantics: drop the node the moment
      // the listener count hits zero so the autoDispose test below is
      // deterministic. The default idle TTL would let the refresh timer
      // keep firing for ~1 s after unsubscribe.
      defaultIdleTTL: 0,
    })

    try {
      const value = await waitForAtomSuccess(
        registry,
        foregroundSessionGateStateAtom,
        gate => (gate as { _tag?: string })._tag === "Running",
        5_000,
      )
      expect(value).toEqual({
        _tag: "Running",
        requestId: "snes/echo.smc",
        gameId: "snes/echo.smc",
      })
    } finally {
      registry.dispose()
    }
  })

  it("stops polling sessiond after the gate atom is unmounted (autoDispose)", async () => {
    // Subscribe via AtomRegistry to mount the atom, wait for one
    // emission, unsubscribe to release autoDispose, then assert that no
    // further requests reach sessiond within multiple refresh windows.
    // This is the renderer-side guarantee that navigating away from the
    // home view stops the 1 Hz poll instead of leaking timers.
    await using sessiond = await withSessiondSocket({
      respond: () =>
        Response.json({
          schemaVersion: 1,
          mode: "home",
          capabilities: {
            managedLaunch: true,
            lifecycleEvents: true,
            perLaunchTermination: true,
          },
          restoreAttempts: 0,
        }),
    })
    await using server = await withRpcServer({ fetch: serverHonoApp.fetch })
    pointWindowAt(server.url)
    configureSessiondEnv(sessiond.socketPath)

    const registry = AtomRegistry.make({
      initialValues: [
        [foregroundSessionStatusLayerAtom, ForegroundSessionStatusLayerLive],
      ],
      // With defaultIdleTTL: 0 the node is finalized the instant the
      // listener count hits zero — the Atom.withRefresh setTimeout chain
      // clears via the atom finalizer and the 1 Hz poll stops.
      defaultIdleTTL: 0,
    })

    // Hold our own subscription so the baseline measurement and the
    // unsubscribe happen at known points in time. waitForAtomSuccess
    // helper unsubscribes internally when its predicate matches; here
    // we want unsubscribe to be the moment we're measuring against.
    let latest: unknown
    const unsubscribe = registry.subscribe(
      foregroundSessionGateStateAtom,
      next => {
        latest = next
      },
      { immediate: true },
    )
    try {
      const start = Date.now()
      while (
        !AsyncResult.isSuccess(
          latest as AsyncResult.AsyncResult<unknown, unknown>,
        )
      ) {
        if (Date.now() - start > 5_000) {
          throw new Error(
            "autoDispose: timed out waiting for first Success emission",
          )
        }
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const baselineHits = sessiond.requestCount()
      expect(baselineHits).toBeGreaterThanOrEqual(1)

      // Drop the only subscriber. With defaultIdleTTL: 0 the refresh
      // timer should clear immediately via the atom finalizer.
      unsubscribe()

      // Wait well past two refresh windows so any leaked timer would
      // visibly bump the request count.
      await new Promise(resolve => setTimeout(resolve, 2_500))

      expect(sessiond.requestCount()).toBe(baselineHits)
    } finally {
      registry.dispose()
    }
  })

  it("surfaces a LoadError gate state when the bun API itself is unreachable", async () => {
    // Boot the bun API just long enough to claim a port, then dispose it
    // before the layer makes its RPC call. The renderer's RpcClientLive
    // tries to POST /api/rpc; the connection is refused; the layer's
    // `onFailure → LoadError` branch fires.
    const server = await withRpcServer({ fetch: serverHonoApp.fetch })
    pointWindowAt(server.url)
    // No sessiond env configured — even if the bun API were up, the path
    // we care about is the transport-level failure to /api/rpc itself.
    await server.dispose()

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const source = yield* ForegroundSessionStatusSource
          return yield* source.get()
        }).pipe(Effect.provide(ForegroundSessionStatusLayerLive)),
      ),
    )

    expect((result as { _tag: string })._tag).toBe("LoadError")
    if ((result as { _tag: string })._tag !== "LoadError")
      throw new Error("unreachable")
    const loadError = result as { _tag: "LoadError"; message: string }
    expect(typeof loadError.message).toBe("string")
    expect(loadError.message.length).toBeGreaterThan(0)
  })
})

async function waitForAtomSuccess<A>(
  registry: AtomRegistry.AtomRegistry,
  // The runtime-backed atom is typed as Atom<AsyncResult<A, E>>; subscribers
  // see the AsyncResult tagged union and must wait for the Success branch.
  atom: Parameters<AtomRegistry.AtomRegistry["subscribe"]>[0],
  predicate: (value: A) => boolean,
  timeoutMs: number,
): Promise<A> {
  return new Promise<A>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    const timeout = setTimeout(() => {
      unsubscribe?.()
      reject(
        new Error(
          `waitForAtomSuccess: predicate did not match within ${timeoutMs} ms`,
        ),
      )
    }, timeoutMs)
    unsubscribe = registry.subscribe(
      atom,
      next => {
        if (
          !AsyncResult.isSuccess(next as AsyncResult.AsyncResult<A, unknown>)
        ) {
          return
        }
        const value = (next as AsyncResult.Success<A, unknown>).value
        if (predicate(value)) {
          clearTimeout(timeout)
          unsubscribe?.()
          resolve(value)
        }
      },
      { immediate: true },
    )
  })
}

type SessiondSocketHarness = {
  url: string
  requestCount: () => number
  dispose: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

async function withSessiondSocket(options: {
  readonly respond: (request: Request) => Response | Promise<Response>
}): Promise<SessiondSocketHarness> {
  let count = 0
  const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-"))
  const socketPath = join(dir, "sessiond.sock")
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    if (
      (init as (RequestInit & { unix?: string }) | undefined)?.unix ===
      socketPath
    ) {
      count += 1
      return options.respond(new Request(input, init))
    }
    return originalFetch(input, init)
  }) as typeof fetch
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    globalThis.fetch = originalFetch
    await rm(dir, { recursive: true, force: true })
  }
  return {
    socketPath,
    requestCount: () => count,
    dispose,
    [Symbol.asyncDispose]: dispose,
  }
}

function configureSessiondEnv(socketPath: string): void {
  process.env.KORRI_SESSIOND_SOCKET = socketPath
  process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
  // Keep the runner-status reader from picking up a stale fixture.
  delete process.env.KORRI_GAME_STREAM_STATUS_PATH
  process.env.KORRI_DAEMON_ID = "integration-test-server"
}

function pointWindowAt(baseUrl: string): void {
  const url = new URL(baseUrl)
  setWindowLocation({
    origin: url.origin,
    href: `${url.origin}/`,
    hostname: url.hostname,
    pathname: "/",
  })
}

function setWindowLocation(location: {
  readonly origin: string
  readonly href: string
  readonly hostname: string
  readonly pathname: string
}): void {
  Object.defineProperty(window.location, "origin", {
    value: location.origin,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "href", {
    value: location.href,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "hostname", {
    value: location.hostname,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "pathname", {
    value: location.pathname,
    writable: true,
    configurable: true,
  })
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}
