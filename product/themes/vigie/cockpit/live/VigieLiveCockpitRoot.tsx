import { RpcClientLive } from "@platform/api/rpc/client"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { serverRpcGroup } from "@product/apps/portal/api/server/rpc-group"
import { Effect, type Scope } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import type {
  CockpitFixture,
  SessionCommandStatus,
} from "../VigieCockpit.context"
import { VigieCockpitRoot } from "../VigieCockpitRoot"
import {
  createVigieLiveFixture,
  createVigieLoadingFixture,
  type VigieLiveSnapshot,
} from "./VigieLiveCockpitData"

const LIVE_REFRESH_MS = 1_500

export function VigieLiveCockpitRoot({
  fixture,
  children,
}: {
  readonly fixture: CockpitFixture
  readonly children: ReactNode
}) {
  const [snapshot, setSnapshot] = useState<VigieLiveSnapshot | null>(null)
  const [sessionCommandStatus, setSessionCommandStatus] =
    useState<SessionCommandStatus>("idle")
  const [sessionCommandMessage, setSessionCommandMessage] = useState<string>()

  useEffect(() => {
    let disposed = false
    let refreshInFlight = false

    const refresh = async () => {
      if (refreshInFlight) return
      refreshInFlight = true
      try {
        const next = await fetchVigieLiveSnapshot()
        if (!disposed) setSnapshot(next)
      } finally {
        refreshInFlight = false
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), LIVE_REFRESH_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [])

  const liveFixture = useMemo(
    () =>
      snapshot
        ? createVigieLiveFixture(fixture, snapshot)
        : createVigieLoadingFixture(fixture),
    [fixture, snapshot],
  )

  const stopSession = useCallback(() => {
    if (!window.confirm("Stop the active Korri foreground session?")) return
    setSessionCommandStatus("pending")
    setSessionCommandMessage("Stopping active session…")
    runServerRpc(
      RpcClient.make(serverRpcGroup).pipe(
        Effect.flatMap(client =>
          client["app.session.stop"]({ force: false, confirmed: true }),
        ),
      ),
    )
      .then(response => {
        setSessionCommandStatus("applied")
        setSessionCommandMessage(stopSessionMessage(response))
        return fetchVigieLiveSnapshot()
      })
      .then(next => setSnapshot(next))
      .catch(error => {
        setSessionCommandStatus("failed")
        setSessionCommandMessage(errorMessage(error))
      })
  }, [])

  return (
    <VigieCockpitRoot
      fixture={liveFixture}
      sessionCommandStatus={sessionCommandStatus}
      sessionCommandMessage={sessionCommandMessage}
      stopSession={stopSession}
    >
      {children}
    </VigieCockpitRoot>
  )
}

export async function fetchVigieLiveSnapshot(): Promise<VigieLiveSnapshot> {
  const observedAt = new Date().toISOString()
  const [
    server,
    session,
    source,
    steam,
    catalog,
    streamConfig,
    streamControls,
    streamState,
  ] = await Promise.all([
    settle(
      runServerRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client => client["app.server.status"]({})),
        ),
      ),
    ),
    settle(
      runServerRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client => client["app.session.status"]({})),
        ),
      ),
    ),
    settle(
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client => client["app.source.status"]({})),
        ),
      ),
    ),
    settle(
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client => client["app.steam.status"]({})),
        ),
      ),
    ),
    settle(
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.catalog.snapshot"]({ scope: "fabric" }),
          ),
        ),
      ),
    ),
    settle(
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client => client["app.stream-control.config.get"]({})),
        ),
      ),
    ),
    settle(
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.controls.get"]({}),
          ),
        ),
      ),
    ),
    settle(
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client => client["app.stream-control.state.get"]({})),
        ),
      ),
    ),
  ])

  return {
    observedAt,
    ...(server.ok ? { server: server.value } : { serverError: server.error }),
    ...(session.ok
      ? { session: session.value }
      : { sessionError: session.error }),
    ...(source.ok ? { source: source.value } : { sourceError: source.error }),
    ...(steam.ok ? { steam: steam.value } : { steamError: steam.error }),
    ...(catalog.ok
      ? { catalog: catalog.value }
      : { catalogError: catalog.error }),
    ...(streamConfig.ok
      ? { streamConfig: streamConfig.value }
      : { streamConfigError: streamConfig.error }),
    ...(streamControls.ok
      ? { streamControls: streamControls.value }
      : { streamControlsError: streamControls.error }),
    ...(streamState.ok
      ? { streamState: streamState.value }
      : { streamStateError: streamState.error }),
  }
}

function runAppRpc<T>(
  effect: Effect.Effect<T, unknown, Scope.Scope | RpcClient.Protocol>,
): Promise<T> {
  return Effect.runPromise(
    Effect.scoped(effect.pipe(Effect.provide(RpcClientLive))),
  )
}

function runServerRpc<T>(
  effect: Effect.Effect<T, unknown, Scope.Scope | RpcClient.Protocol>,
): Promise<T> {
  return Effect.runPromise(
    Effect.scoped(effect.pipe(Effect.provide(RpcClientLive))),
  )
}

type Settled<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string }

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

function stopSessionMessage(response: unknown): string {
  if (
    typeof response !== "object" ||
    response === null ||
    !("_tag" in response)
  ) {
    return "Stop request completed."
  }
  switch (response._tag) {
    case "Stopped":
      return "Stop request sent."
    case "NothingToStop":
      return "No active session to stop."
    case "ConfirmationRequired":
      return "Stop request requires confirmation."
    case "SessiondNotConfigured":
      return "sessiond is not configured on this host."
    case "HostUnavailable":
      return "Session host is unavailable."
    default:
      return "Stop request completed."
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "unavailable"
}
