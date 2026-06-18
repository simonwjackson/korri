import type {
  CockpitDevice,
  CockpitFixture,
  CockpitSession,
  DeviceMetric,
  LibraryGameEntry,
  LifecycleEvent,
  LogLine,
  MetricStatus,
  SessionHealth,
  SessionHistoryEntry,
  SessionPhaseStep,
  SessionReadout,
  Subsystem,
} from "../VigieCockpit.context"

type CatalogSnapshotResponse = {
  readonly [key: string]: unknown
  readonly peers: readonly {
    readonly [key: string]: unknown
    readonly hostId: string
    readonly displayName: string
    readonly isLocal: boolean
    readonly caps: readonly string[]
    readonly status: string
  }[]
  readonly entries: readonly {
    readonly [key: string]: unknown
    readonly id: string
    readonly title?: string
    readonly metadata?: { readonly name?: string }
    readonly system?: string
    readonly releases: readonly {
      readonly [key: string]: unknown
      readonly system?: string
    }[]
    readonly source: {
      readonly [key: string]: unknown
      readonly isLocal: boolean
      readonly hostId: string
    }
    readonly launchable: boolean
    readonly collections?: readonly string[]
  }[]
  readonly health: {
    readonly [key: string]: unknown
    readonly failedPeers: number
    readonly self: string
    readonly readyPeers: number
  }
  readonly generation: number
}

type ServerStatusResponse = {
  readonly [key: string]: unknown
  readonly serverId: string
  readonly displayName: string
  readonly capabilities: readonly string[]
  readonly status: string
  readonly message?: string
  readonly sessiondUnavailable?: boolean
  readonly sessiond?: {
    readonly [key: string]: unknown
    readonly mode: string
    readonly failureReason?: string
    readonly active?: {
      readonly [key: string]: unknown
      readonly launchId: string
      readonly phase?: string
    }
  }
}

type SourceStatusResponse = {
  readonly [key: string]: unknown
  readonly status: string
  readonly message?: string
  readonly catalog?: string
}

type SteamDiagnosticsResponse = {
  readonly [key: string]: unknown
  readonly observer: {
    readonly [key: string]: unknown
    readonly state: string
    readonly activeFiles: readonly string[]
    readonly watchedFiles: readonly string[]
    readonly lastError?: string
  }
  readonly active?: SteamSessionStatus
  readonly latest?: SteamSessionStatus
  readonly recentEvidence: readonly {
    readonly [key: string]: unknown
    readonly observedAt: string
    readonly confidence: string
    readonly source: string
    readonly excerpt: string
  }[]
}

type SteamSessionStatus = {
  readonly [key: string]: unknown
  readonly status: string
  readonly appId: string
  readonly firstObservedAt: string
  readonly lastObservedAt: string
  readonly confidence: string
  readonly ownership: string
  readonly steam: {
    readonly [key: string]: unknown
    readonly trackedPids: readonly number[]
    readonly taskHistory: readonly string[]
    readonly lastTask?: string
    readonly commandExcerpt?: string
  }
}

type StreamReadbackEntry =
  | { readonly status: "ok"; readonly readback: Record<string, unknown> }
  | { readonly status: "disabled" }
  | { readonly status: "error"; readonly error: string }

type GetStreamControlConfigResponse = {
  readonly [key: string]: unknown
  readonly artifactDir?: string
}
type GetStreamControlControlsResponse = {
  readonly [key: string]: unknown
  readonly controls: readonly {
    readonly [key: string]: unknown
    readonly status: string
  }[]
}
type GetStreamControlStateResponse = {
  readonly [key: string]: unknown
  readonly moonlight:
    | {
        readonly status: "ok"
        readonly readback: {
          readonly [key: string]: unknown
          readonly bitrateKbps: number | null
          readonly fps: number | null
          readonly resolution?: {
            readonly width: number
            readonly height: number
          }
        }
      }
    | { readonly status: "disabled" }
    | { readonly status: "error"; readonly error: string }
  readonly brightness:
    | {
        readonly status: "ok"
        readonly readback: {
          readonly [key: string]: unknown
          readonly percent: number | null
        }
      }
    | { readonly status: "disabled" }
    | { readonly status: "error"; readonly error: string }
  readonly battery:
    | {
        readonly status: "ok"
        readonly readback: {
          readonly [key: string]: unknown
          readonly percent: number | null
          readonly status?: string
        }
      }
    | { readonly status: "disabled" }
    | { readonly status: "error"; readonly error: string }
  readonly plugins: Readonly<Record<string, StreamReadbackEntry>>
}

export interface VigieLiveSnapshot {
  readonly observedAt: string
  readonly server?: ServerStatusResponse
  readonly serverError?: string
  readonly session?: unknown
  readonly sessionError?: string
  readonly source?: SourceStatusResponse
  readonly sourceError?: string
  readonly steam?: SteamDiagnosticsResponse
  readonly steamError?: string
  readonly catalog?: CatalogSnapshotResponse
  readonly catalogError?: string
  readonly streamConfig?: GetStreamControlConfigResponse
  readonly streamConfigError?: string
  readonly streamControls?: GetStreamControlControlsResponse
  readonly streamControlsError?: string
  readonly streamState?: GetStreamControlStateResponse
  readonly streamStateError?: string
}

export function createVigieLiveFixture(
  base: CockpitFixture,
  snapshot: VigieLiveSnapshot,
): CockpitFixture {
  const session = cockpitSessionFromLive(snapshot)
  const fleet = fleetFromLive(snapshot)
  return {
    ...base,
    device: activeDeviceFromLive(snapshot, fleet),
    fleet,
    scenarios: [{ id: "live", label: "Live", session }],
    metrics: metricsFromLive(base.metrics, snapshot),
    governor: base.governor,
    subsystems: subsystemsFromLive(snapshot),
    log: logsFromLive(base.log, snapshot),
    sessionHistory: sessionHistoryFromLive(base.sessionHistory, snapshot),
    lifecycle: lifecycleFromLive(base.lifecycle, snapshot),
    library: libraryFromLive(snapshot),
  }
}

export function createVigieLoadingFixture(
  base: CockpitFixture,
): CockpitFixture {
  return {
    ...base,
    device: LOCAL_PLACEHOLDER_DEVICE,
    fleet: [LOCAL_PLACEHOLDER_DEVICE],
    scenarios: [
      {
        id: "live",
        label: "Live",
        session: {
          health: "active",
          headline: "Connecting to Korri telemetry",
          phases: [
            phase("prepare", "Discover", "active"),
            phase("run", "Read", "pending"),
            phase("cool", "Render", "pending"),
          ],
          stream: [],
          note: "Polling /api/rpc for session, Steam, catalog, source, and stream-control status.",
        },
      },
    ],
    library: [],
    subsystems: [
      {
        id: "rpc",
        label: "RPC",
        status: "degraded",
        detail: "connecting to /api/rpc",
      },
    ],
    log: [
      {
        ts: shortTime(new Date().toISOString()),
        level: "info",
        source: "vigie",
        message: "connecting to live Korri telemetry",
      },
    ],
  }
}

function cockpitSessionFromLive(snapshot: VigieLiveSnapshot): CockpitSession {
  const steam = snapshot.steam?.active ?? snapshot.steam?.latest
  const serverSessiond = snapshot.server?.sessiond
  const sessionMode =
    serverSessiond?.mode ?? sessionStatusMode(snapshot.session)
  const activeSession =
    serverSessiond?.active ?? sessionStatusActive(snapshot.session)
  const stream = streamReadouts(snapshot)

  if (steam) {
    return {
      health: healthFromSteam(steam.status, snapshot),
      headline: `${steam.status} · Steam ${steam.appId}`,
      gameId: `steam:${steam.appId}`,
      requestId: activeSession?.launchId,
      phases: phasesFromSteam(steam.status),
      stream,
      note: steamNote(snapshot),
    }
  }

  if (sessionMode && sessionMode !== "home" && sessionMode !== "idle") {
    return {
      health: healthFromSessiondMode(sessionMode),
      headline: `${labelize(sessionMode)} · ${activeSession?.launchId ?? "sessiond"}`,
      requestId: activeSession?.launchId,
      phases: phasesFromSessiondMode(sessionMode),
      stream,
      note:
        serverSessiond?.failureReason ?? sessionStatusFailure(snapshot.session),
    }
  }

  const error = firstError(snapshot)
  if (error) {
    return {
      health: "caution",
      headline: "Telemetry partially unavailable",
      phases: [
        phase("prepare", "Connect", "failed", "RPC"),
        phase("run", "Observe", "pending"),
        phase("cool", "Recover", "pending"),
      ],
      stream,
      note: error,
    }
  }

  return {
    health: "idle",
    headline: "No active session",
    phases: [
      phase("prepare", "Prepare", "pending"),
      phase("run", "Run", "pending"),
      phase("cool", "Cool down", "pending"),
    ],
    stream,
  }
}

function streamReadouts(snapshot: VigieLiveSnapshot): CockpitSession["stream"] {
  const state = snapshot.streamState
  const readouts: SessionReadout[] = []
  if (state?.moonlight.status === "ok") {
    const moonlight = state.moonlight.readback
    if (moonlight.bitrateKbps !== null) {
      readouts.push({
        id: "moonlight-bitrate",
        label: "Moonlight",
        value: `${(moonlight.bitrateKbps / 1000).toFixed(1)} Mbps`,
        accent: "nominal",
      })
    }
    if (moonlight.fps !== null) {
      readouts.push({
        id: "moonlight-fps",
        label: "Stream FPS",
        value: String(moonlight.fps),
        accent: "nominal",
      })
    }
    if (moonlight.resolution) {
      readouts.push({
        id: "moonlight-resolution",
        label: "Stream res",
        value: resolution(moonlight.resolution),
      })
    }
  }
  for (const [provider, entry] of Object.entries(state?.plugins ?? {})) {
    if (!isRecord(entry) || entry.status !== "ok") continue
    const readback = isRecord(entry.readback) ? entry.readback : {}
    for (const [key, value] of Object.entries(readback)) {
      if (value === null || value === undefined) continue
      readouts.push({
        id: `${provider}/${key}`,
        label: labelize(key),
        value: readoutValue(value),
        accent: "nominal",
      })
    }
  }
  if (
    state?.brightness.status === "ok" &&
    state.brightness.readback.percent !== null
  ) {
    readouts.push({
      id: "brightness",
      label: "Brightness",
      value: `${state.brightness.readback.percent}%`,
      accent: accentForPercent(state.brightness.readback.percent, 90, 98),
    })
  }
  if (
    state?.battery.status === "ok" &&
    state.battery.readback.percent !== null
  ) {
    readouts.push({
      id: "battery",
      label: "Battery",
      value: `${state.battery.readback.percent}%`,
      accent:
        state.battery.readback.percent < 20
          ? "critical"
          : state.battery.readback.percent < 35
            ? "caution"
            : "nominal",
    })
  }
  if (snapshot.steam?.active) {
    readouts.push({
      id: "steam-pids",
      label: "Steam PIDs",
      value: String(snapshot.steam.active.steam.trackedPids.length),
      accent:
        snapshot.steam.active.steam.trackedPids.length > 0
          ? "nominal"
          : "caution",
    })
  }
  return readouts
}

// A neutral, non-peer placeholder for the moments before discovery returns
// anything. Never a hardcoded peer identity (no fixture device leaks here).
const LOCAL_PLACEHOLDER_DEVICE: CockpitDevice = {
  id: "local",
  name: "Local host",
  role: "Discovering…",
  online: false,
}

type CatalogPeer = NonNullable<VigieLiveSnapshot["catalog"]>["peers"][number]

function peerToDevice(peer: CatalogPeer): CockpitDevice {
  return {
    id: peer.hostId,
    name: peer.displayName,
    role: peer.isLocal ? "Local catalog" : peer.caps.join(" · ") || "peer",
    online: peer.status === "ready",
  }
}

// The active device is the discovered local (self) catalog peer, then the
// server identity, then a neutral placeholder — discovery-driven, like the app.
function selfDeviceFromLive(
  snapshot: VigieLiveSnapshot,
): CockpitDevice | undefined {
  const local = snapshot.catalog?.peers.find(peer => peer.isLocal)
  if (local) return peerToDevice(local)
  if (snapshot.server) {
    return {
      id: snapshot.server.serverId,
      name: snapshot.server.displayName,
      role: snapshot.server.capabilities.join(" · ") || "Local host",
      online: snapshot.server.status === "available",
    }
  }
  return undefined
}

function activeDeviceFromLive(
  snapshot: VigieLiveSnapshot,
  fleet: readonly CockpitDevice[],
): CockpitDevice {
  const self = selfDeviceFromLive(snapshot)
  if (self) return fleet.find(member => member.id === self.id) ?? self
  return fleet[0] ?? LOCAL_PLACEHOLDER_DEVICE
}

// Fleet is the set of discovered catalog peers, deduplicated by host (the same
// host can appear as both the local self peer and a bonjour-discovered stream
// peer). The local/self entry wins so each device shows once.
function fleetFromLive(snapshot: VigieLiveSnapshot): readonly CockpitDevice[] {
  const peers = snapshot.catalog?.peers
  if (peers && peers.length > 0) {
    const byHost = new Map<string, CatalogPeer>()
    for (const peer of peers) {
      const existing = byHost.get(peer.hostId)
      if (!existing || (peer.isLocal && !existing.isLocal)) {
        byHost.set(peer.hostId, peer)
      }
    }
    return [...byHost.values()].map(peerToDevice)
  }
  const self = selfDeviceFromLive(snapshot)
  return self ? [self] : [LOCAL_PLACEHOLDER_DEVICE]
}

function metricsFromLive(
  fallback: readonly DeviceMetric[],
  snapshot: VigieLiveSnapshot,
): readonly DeviceMetric[] {
  const state = snapshot.streamState
  if (!state) return fallback
  const metrics: DeviceMetric[] = []
  if (state.moonlight.status === "ok") {
    const readback = state.moonlight.readback
    if (readback.bitrateKbps !== null) {
      metrics.push(
        metric(
          "moonlight-bitrate",
          "Bitrate",
          Math.round(readback.bitrateKbps / 1000),
          " Mbps",
          "nominal",
        ),
      )
    }
    if (readback.fps !== null) {
      metrics.push(
        metric(
          "moonlight-fps",
          "Stream FPS",
          readback.fps,
          "",
          fpsStatus(readback.fps),
        ),
      )
    }
  }
  for (const [provider, entry] of Object.entries(state.plugins)) {
    if (!isRecord(entry) || entry.status !== "ok") continue
    const readback = isRecord(entry.readback) ? entry.readback : {}
    for (const [key, value] of Object.entries(readback)) {
      if (typeof value !== "number") continue
      metrics.push(
        metric(
          `${provider}/${key}`,
          labelize(key),
          value,
          key.includes("fps") && value !== 0 ? " fps" : "",
          key.includes("fps") ? fpsStatus(value || 60) : "nominal",
        ),
      )
    }
  }
  if (
    state.brightness.status === "ok" &&
    state.brightness.readback.percent !== null
  ) {
    metrics.push(
      metric(
        "brightness",
        "Brightness",
        state.brightness.readback.percent,
        "%",
        percentStatus(state.brightness.readback.percent),
      ),
    )
  }
  if (
    state.battery.status === "ok" &&
    state.battery.readback.percent !== null
  ) {
    metrics.push(
      metric(
        "battery",
        "Battery",
        state.battery.readback.percent,
        "%",
        state.battery.readback.percent < 20
          ? "critical"
          : state.battery.readback.percent < 35
            ? "caution"
            : "nominal",
      ),
    )
  }
  return metrics.length > 0 ? metrics : fallback
}

function subsystemsFromLive(snapshot: VigieLiveSnapshot): readonly Subsystem[] {
  const subsystems: Subsystem[] = []
  subsystems.push(
    subsystem(
      "server",
      "korrid",
      snapshot.serverError,
      snapshot.server?.status === "available",
      snapshot.server?.message ?? snapshot.server?.displayName,
    ),
  )
  subsystems.push(
    subsystem(
      "source",
      "source",
      snapshot.sourceError,
      snapshot.source?.status === "available",
      snapshot.source?.message ??
        `catalog ${snapshot.source?.catalog ?? "unknown"}`,
    ),
  )
  if (snapshot.server?.sessiond) {
    subsystems.push({
      id: "sessiond",
      label: "sessiond",
      status: snapshot.server.sessiond.failureReason ? "degraded" : "nominal",
      detail: `${snapshot.server.sessiond.mode}${snapshot.server.sessiond.active ? ` · ${snapshot.server.sessiond.active.launchId}` : ""}${snapshot.server.sessiond.failureReason ? ` · ${snapshot.server.sessiond.failureReason}` : ""}`,
    })
  } else if (snapshot.server?.sessiondUnavailable) {
    subsystems.push({
      id: "sessiond",
      label: "sessiond",
      status: "down",
      detail: "unavailable",
    })
  }
  if (snapshot.catalog) {
    subsystems.push({
      id: "catalog",
      label: "catalog",
      status:
        snapshot.catalog.health.failedPeers > 0 ||
        snapshot.catalog.health.self === "failed"
          ? "degraded"
          : "nominal",
      detail: `${snapshot.catalog.entries.length} entries · ${snapshot.catalog.health.readyPeers} peers ready · gen ${snapshot.catalog.generation}`,
    })
  } else {
    subsystems.push(
      subsystem("catalog", "catalog", snapshot.catalogError, false),
    )
  }
  if (snapshot.steam) {
    subsystems.push({
      id: "steam",
      label: "Steam observer",
      status:
        snapshot.steam.observer.state === "running"
          ? "nominal"
          : snapshot.steam.observer.state === "degraded"
            ? "degraded"
            : "down",
      detail: `${snapshot.steam.observer.state} · ${snapshot.steam.observer.activeFiles.length}/${snapshot.steam.observer.watchedFiles.length} logs active${snapshot.steam.active ? ` · app ${snapshot.steam.active.appId}` : ""}${snapshot.steam.observer.lastError ? ` · ${snapshot.steam.observer.lastError}` : ""}`,
    })
  } else {
    subsystems.push(
      subsystem("steam", "Steam observer", snapshot.steamError, false),
    )
  }
  addStreamStateSubsystems(subsystems, snapshot)
  return subsystems
}

function logsFromLive(
  fallback: readonly LogLine[],
  snapshot: VigieLiveSnapshot,
): readonly LogLine[] {
  const logs: LogLine[] = []
  for (const [source, message] of errors(snapshot)) {
    logs.push({
      ts: shortTime(snapshot.observedAt),
      level: "warn",
      source,
      message,
    })
  }
  if (snapshot.server?.sessiond?.failureReason) {
    logs.push({
      ts: shortTime(snapshot.observedAt),
      level: "error",
      source: "sessiond",
      message: snapshot.server.sessiond.failureReason,
    })
  }
  if (snapshot.steam) {
    for (const evidence of snapshot.steam.recentEvidence) {
      logs.push({
        ts: shortTime(evidence.observedAt),
        level: evidence.confidence === "low" ? "warn" : "info",
        source: evidence.source,
        message: evidence.excerpt,
      })
    }
  }
  addStreamStateLogs(logs, snapshot)
  return logs.length > 0 ? logs.slice(-80) : fallback
}

function lifecycleFromLive(
  fallback: readonly LifecycleEvent[],
  snapshot: VigieLiveSnapshot,
): readonly LifecycleEvent[] {
  const events: LifecycleEvent[] = []
  const sessiond = snapshot.server?.sessiond
  if (sessiond) {
    events.push({
      ts: shortTime(snapshot.observedAt),
      phase: labelize(sessiond.mode),
      detail: sessiond.active
        ? `active ${sessiond.active.launchId}${sessiond.active.phase ? ` · ${sessiond.active.phase}` : ""}`
        : "no active launch",
      level: sessiond.failureReason ? "warn" : "info",
    })
  }
  const steam = snapshot.steam?.active ?? snapshot.steam?.latest
  if (steam) {
    events.push({
      ts: shortTime(steam.lastObservedAt),
      phase: steam.status,
      detail: `Steam ${steam.appId} · ${steam.confidence} · ${steam.ownership}`,
      level: steam.status === "Stuck" ? "warn" : "info",
    })
    for (const task of steam.steam.taskHistory.slice(-4)) {
      events.push({
        ts: shortTime(steam.lastObservedAt),
        phase: "Steam task",
        detail: task,
        level: "debug",
      })
    }
  }
  return events.length > 0 ? events : fallback
}

function libraryFromLive(
  snapshot: VigieLiveSnapshot,
): readonly LibraryGameEntry[] {
  const entries = snapshot.catalog?.entries.map(entry => ({
    id: entry.id,
    title: entry.title ?? entry.metadata?.name ?? entry.id,
    system: entry.system ?? entry.releases[0]?.system ?? "unknown",
    source: entry.source.isLocal ? "self" : entry.source.hostId,
    releaseCount: entry.releases.length,
    launchable: entry.launchable,
    collections: entry.collections ?? [],
  }))
  return entries ?? []
}

function sessionHistoryFromLive(
  fallback: readonly SessionHistoryEntry[],
  snapshot: VigieLiveSnapshot,
): readonly SessionHistoryEntry[] {
  const latest = snapshot.steam?.latest
  if (!latest) return fallback
  const liveEntry: SessionHistoryEntry = {
    id: `steam-${latest.appId}-${latest.firstObservedAt}`,
    game: `Steam ${latest.appId}`,
    mode: "local",
    outcome:
      latest.status === "Running"
        ? "running"
        : latest.status === "Stuck"
          ? "failed"
          : "ended",
    duration: elapsed(latest.firstObservedAt, latest.lastObservedAt),
    requestId: snapshot.server?.sessiond?.active?.launchId ?? latest.ownership,
    when: relative(latest.lastObservedAt, snapshot.observedAt),
  }
  return [
    liveEntry,
    ...fallback.filter(entry => entry.id !== liveEntry.id),
  ].slice(0, 12)
}

function addStreamStateSubsystems(
  subsystems: Subsystem[],
  snapshot: VigieLiveSnapshot,
) {
  const state = snapshot.streamState
  const config = snapshot.streamConfig
  if (!state) {
    subsystems.push(
      subsystem(
        "stream-control",
        "stream-control",
        snapshot.streamStateError,
        false,
      ),
    )
    return
  }
  subsystems.push({
    id: "stream-control",
    label: "stream-control",
    status: snapshot.streamControlsError ? "degraded" : "nominal",
    detail: `${snapshot.streamControls?.controls.filter(control => control.status === "supported").length ?? 0} controls supported${config?.artifactDir ? ` · artifacts ${config.artifactDir}` : ""}`,
  })
  for (const key of ["moonlight", "brightness", "battery"] as const) {
    const entry = state[key]
    subsystems.push({
      id: key,
      label: key,
      status:
        entry.status === "ok"
          ? "nominal"
          : entry.status === "disabled"
            ? "down"
            : "degraded",
      detail:
        entry.status === "ok"
          ? readbackSummary(key, entry.readback)
          : entry.status === "error"
            ? entry.error
            : "disabled",
    })
  }
  for (const [provider, entry] of Object.entries(state.plugins)) {
    if (!isRecord(entry)) continue
    subsystems.push({
      id: provider,
      label: provider,
      status:
        entry.status === "ok"
          ? "nominal"
          : entry.status === "disabled"
            ? "down"
            : "degraded",
      detail:
        entry.status === "ok"
          ? readbackSummary(provider, entry.readback)
          : entry.status === "error" && typeof entry.error === "string"
            ? entry.error
            : "disabled",
    })
  }
}

function addStreamStateLogs(logs: LogLine[], snapshot: VigieLiveSnapshot) {
  const state = snapshot.streamState
  if (!state) return
  for (const key of ["moonlight", "brightness", "battery"] as const) {
    const entry = state[key]
    if (entry.status === "error") {
      logs.push({
        ts: shortTime(snapshot.observedAt),
        level: "warn",
        source: key,
        message: entry.error,
      })
    }
  }
  for (const [provider, entry] of Object.entries(state.plugins)) {
    if (isRecord(entry) && entry.status === "error") {
      logs.push({
        ts: shortTime(snapshot.observedAt),
        level: "warn",
        source: provider,
        message: typeof entry.error === "string" ? entry.error : "error",
      })
    }
  }
}

function healthFromSteam(
  status: string,
  snapshot: VigieLiveSnapshot,
): SessionHealth {
  if (status === "Running") return "nominal"
  if (status === "Stuck") return "critical"
  if (status === "Stopped") return firstError(snapshot) ? "caution" : "idle"
  return "active"
}

function healthFromSessiondMode(mode: string): SessionHealth {
  if (mode === "game") return "nominal"
  if (mode === "recovering") return "critical"
  if (mode === "restoring") return "caution"
  if (mode === "stopped" || mode === "idle" || mode === "home") return "idle"
  return "active"
}

function phasesFromSteam(status: string): readonly SessionPhaseStep[] {
  if (status === "Preparing" || status === "Launching") {
    return [
      phase("prepare", "Prepare", "active", status),
      phase("run", "Run", "pending"),
      phase("cool", "Cool down", "pending"),
    ]
  }
  if (status === "Running") {
    return [
      phase("prepare", "Prepare", "done"),
      phase("run", "Run", "active", "Steam Running"),
      phase("cool", "Cool down", "pending"),
    ]
  }
  if (status === "Stopping") {
    return [
      phase("prepare", "Prepare", "done"),
      phase("run", "Run", "done"),
      phase("cool", "Cool down", "active", "Stopping"),
    ]
  }
  if (status === "Stuck") {
    return [
      phase("prepare", "Prepare", "done"),
      phase("run", "Run", "failed", "Stuck"),
      phase("cool", "Cool down", "pending"),
    ]
  }
  return [
    phase("prepare", "Prepare", "done"),
    phase("run", "Run", "done"),
    phase("cool", "Cool down", "done"),
  ]
}

function phasesFromSessiondMode(mode: string): readonly SessionPhaseStep[] {
  if (mode === "launching" || mode === "starting") {
    return [
      phase("prepare", "Prepare", "active", mode),
      phase("run", "Run", "pending"),
      phase("cool", "Cool down", "pending"),
    ]
  }
  if (mode === "game") {
    return [
      phase("prepare", "Prepare", "done"),
      phase("run", "Run", "active", "Foreground"),
      phase("cool", "Cool down", "pending"),
    ]
  }
  if (mode === "restoring") {
    return [
      phase("prepare", "Prepare", "done"),
      phase("run", "Run", "done"),
      phase("cool", "Cool down", "active", "Restoring"),
    ]
  }
  if (mode === "recovering") {
    return [
      phase("prepare", "Prepare", "done"),
      phase("run", "Run", "failed", "Recovering"),
      phase("cool", "Cool down", "active"),
    ]
  }
  return [
    phase("prepare", "Prepare", "pending"),
    phase("run", "Run", "pending"),
    phase("cool", "Cool down", "pending"),
  ]
}

function steamNote(snapshot: VigieLiveSnapshot): string | undefined {
  const steam = snapshot.steam?.active ?? snapshot.steam?.latest
  return (
    snapshot.server?.sessiond?.failureReason ??
    snapshot.steam?.observer.lastError ??
    steam?.steam.lastTask ??
    steam?.steam.commandExcerpt
  )
}

function sessionStatusMode(session: unknown): string | undefined {
  if (!isRecord(session) || session._tag !== "SessionStatus") return undefined
  return typeof session.mode === "string" ? session.mode : undefined
}

function sessionStatusFailure(session: unknown): string | undefined {
  if (!isRecord(session) || session._tag !== "SessionStatus") return undefined
  return typeof session.failureReason === "string"
    ? session.failureReason
    : undefined
}

function sessionStatusActive(
  session: unknown,
): { readonly launchId: string; readonly phase?: string } | undefined {
  if (!isRecord(session) || !isRecord(session.active)) return undefined
  const { launchId, phase } = session.active
  if (typeof launchId !== "string") return undefined
  return {
    launchId,
    ...(typeof phase === "string" ? { phase } : {}),
  }
}

function subsystem(
  id: string,
  label: string,
  error: string | undefined,
  ok: boolean | undefined,
  detail?: string,
): Subsystem {
  return {
    id,
    label,
    status: error ? "down" : ok ? "nominal" : "degraded",
    detail: error ?? detail ?? "unavailable",
  }
}

function metric(
  id: string,
  label: string,
  value: number,
  unit: string,
  status: MetricStatus,
): DeviceMetric {
  return {
    id,
    label,
    value,
    unit,
    status,
    series: trailingSeries(value),
  }
}

function trailingSeries(value: number): readonly number[] {
  return [0.72, 0.78, 0.83, 0.8, 0.9, 0.95, 0.92, 1].map(factor =>
    Math.round(value * factor),
  )
}

function fpsStatus(value: number): MetricStatus {
  if (value >= 55) return "nominal"
  if (value >= 30) return "caution"
  return "critical"
}

function percentStatus(value: number): MetricStatus {
  if (value >= 90) return "caution"
  return "nominal"
}

function accentForPercent(
  value: number,
  caution: number,
  critical: number,
): SessionHealth {
  if (value >= critical) return "critical"
  if (value >= caution) return "caution"
  return "nominal"
}

function phase(
  id: string,
  label: string,
  status: SessionPhaseStep["status"],
  substate?: string,
): SessionPhaseStep {
  return { id, label, status, ...(substate ? { substate } : {}) }
}

function errors(
  snapshot: VigieLiveSnapshot,
): readonly (readonly [string, string])[] {
  const entries: Array<readonly [string, string | undefined]> = [
    ["server", snapshot.serverError],
    ["session", snapshot.sessionError],
    ["source", snapshot.sourceError],
    ["steam", snapshot.steamError],
    ["catalog", snapshot.catalogError],
    ["stream-config", snapshot.streamConfigError],
    ["stream-controls", snapshot.streamControlsError],
    ["stream-state", snapshot.streamStateError],
  ]
  return entries.filter(
    (entry): entry is readonly [string, string] => entry[1] !== undefined,
  )
}

function firstError(snapshot: VigieLiveSnapshot): string | undefined {
  return errors(snapshot)[0]?.[1]
}

function shortTime(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return iso
  return date.toISOString().slice(11, 23)
}

function resolution(value: {
  readonly width: number
  readonly height: number
}) {
  return `${value.width}×${value.height}`
}

function readoutValue(value: unknown): string {
  if (isRecord(value)) {
    if (typeof value.width === "number" && typeof value.height === "number") {
      return resolution({ width: value.width, height: value.height })
    }
    return JSON.stringify(value)
  }
  return String(value)
}

function labelize(value: string): string {
  return value
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function readbackSummary(key: string, readback: unknown): string {
  if (key === "moonlight" && isRecord(readback)) {
    return (
      [
        typeof readback.bitrateKbps === "number"
          ? `${readback.bitrateKbps / 1000} Mbps`
          : undefined,
        typeof readback.fps === "number" ? `${readback.fps} fps` : undefined,
      ]
        .filter(Boolean)
        .join(" · ") || "ok"
    )
  }
  if (key === "brightness" && isRecord(readback)) {
    return typeof readback.percent === "number" ? `${readback.percent}%` : "ok"
  }
  if (key === "battery" && isRecord(readback)) {
    return (
      [
        typeof readback.percent === "number"
          ? `${readback.percent}%`
          : undefined,
        typeof readback.status === "string" ? readback.status : undefined,
      ]
        .filter(Boolean)
        .join(" · ") || "ok"
    )
  }
  return "ok"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function elapsed(startIso: string, endIso: string): string {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return "—"
  const seconds = Math.round((end - start) / 1000)
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${remaining.toString().padStart(2, "0")}`
}

function relative(targetIso: string, observedIso: string): string {
  const target = Date.parse(targetIso)
  const observed = Date.parse(observedIso)
  if (!Number.isFinite(target) || !Number.isFinite(observed)) return "recently"
  const seconds = Math.max(0, Math.round((observed - target) / 1000))
  if (seconds < 5) return "now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}
