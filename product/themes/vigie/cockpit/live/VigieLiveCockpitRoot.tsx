import type { KorriPlatformBridge } from "@platform/theme/bridge"
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

type PluginDiagnosticsEnvelope = {
  readonly diagnostics?: unknown
}

export function VigieLiveCockpitRoot({
  bridge,
  fixture,
  children,
}: {
  readonly bridge: KorriPlatformBridge
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
        const next = await fetchVigieLiveSnapshot(bridge)
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
  }, [bridge])

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
    bridge.api
      .rpc("app.session.stop", { force: false, confirmed: true })
      .then(response => {
        setSessionCommandStatus("applied")
        setSessionCommandMessage(stopSessionMessage(response))
        return fetchVigieLiveSnapshot(bridge)
      })
      .then(next => setSnapshot(next))
      .catch(error => {
        setSessionCommandStatus("failed")
        setSessionCommandMessage(errorMessage(error))
      })
  }, [bridge])

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

export async function fetchVigieLiveSnapshot(
  bridge: KorriPlatformBridge,
): Promise<VigieLiveSnapshot> {
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
    settle(bridge.api.rpc("app.server.status", {})),
    settle(bridge.api.rpc("app.session.status", {})),
    settle(bridge.api.rpc("app.source.status", {})),
    settle(
      bridge.api.rpc("app.plugin.diagnostics.collect", {
        providerId: "@korri:steam",
      }),
    ),
    settle(bridge.api.rpc("app.catalog.snapshot", { scope: "fabric" })),
    settle(bridge.api.rpc("app.stream-control.config.get", {})),
    settle(bridge.api.rpc("app.stream-control.controls.get", {})),
    settle(bridge.api.rpc("app.stream-control.state.get", {})),
  ])

  return {
    observedAt,
    ...(server.ok ? { server: server.value } : { serverError: server.error }),
    ...(session.ok
      ? { session: session.value }
      : { sessionError: session.error }),
    ...(source.ok ? { source: source.value } : { sourceError: source.error }),
    ...(steam.ok
      ? {
          steam: (steam.value as PluginDiagnosticsEnvelope)
            .diagnostics as VigieLiveSnapshot["steam"],
        }
      : { steamError: steam.error }),
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
  } as VigieLiveSnapshot
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
