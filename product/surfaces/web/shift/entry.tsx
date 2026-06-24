import { useAtomRefresh } from "@effect/atom-react"
import {
  CatalogFactsError,
  CatalogFactsSource,
  type CatalogSnapshotFacts,
} from "@platform/catalog/catalog-facts-source"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  Launcher,
  LibraryError,
  LibrarySource,
} from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import {
  catalogFactsSourceLayerAtom,
  catalogSnapshotAtom,
} from "@platform/react/catalog/catalog-atoms"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { ForegroundSessionStatusSource } from "@platform/stream/foreground-session-status-source"
import type {
  KorriPlatformBridge,
  KorriSurfaceEntrypoint,
} from "@platform/surface/bridge"
import { createHashHistory } from "@tanstack/history"
import { Effect, Layer } from "effect"
import { useEffect } from "react"
import { mountShift } from "./mount-shift"

export const shiftTheme: KorriSurfaceEntrypoint = {
  id: "shift",
  mount(host, { bridge }) {
    const runtimeConfig = readRuntimeConfig(window)
    const initialValues = [
      [
        catalogFactsSourceLayerAtom,
        createBridgeCatalogFactsSourceLayer(bridge),
      ],
      [librarySourceLayerAtom, createBridgeLibrarySourceLayer(bridge)],
      [launcherLayerAtom, createBridgeLauncherLayer(bridge)],
      [
        foregroundSessionStatusLayerAtom,
        createBridgeForegroundSessionLayer(bridge),
      ],
    ] as const

    const mounted = mountShift(host, {
      data: { initialValues },
      ...(runtimeConfig.desktopInput
        ? { navigation: { history: createHashHistory() } }
        : {}),
      beforeRouter: (
        <ShiftBridgeRuntimeChrome
          liveUsbArtifact={runtimeConfig.liveUsbArtifact}
        />
      ),
    })

    return () => mounted.dispose()
  },
}

export default shiftTheme

type LiveUsbArtifact = "product" | "developer"

function ShiftBridgeRuntimeChrome({
  liveUsbArtifact,
}: {
  readonly liveUsbArtifact?: LiveUsbArtifact
}) {
  useLibraryRefreshOnConfigChanged()
  return <LiveUsbArtifactNotice artifact={liveUsbArtifact} />
}

function readRuntimeConfig(target: Window): {
  readonly desktopInput: boolean
  readonly liveUsbArtifact?: LiveUsbArtifact
} {
  const runtime = (
    target as {
      readonly __korriRuntimeConfig?: {
        readonly desktopInput?: unknown
        readonly liveUsbArtifact?: unknown
      }
    }
  ).__korriRuntimeConfig

  return {
    desktopInput: runtime?.desktopInput === true,
    ...(runtime?.liveUsbArtifact === "product" ||
    runtime?.liveUsbArtifact === "developer"
      ? { liveUsbArtifact: runtime.liveUsbArtifact }
      : {}),
  }
}

function useLibraryRefreshOnConfigChanged() {
  const refreshCatalogSnapshot = useAtomRefresh(catalogSnapshotAtom)

  useEffect(() => {
    if (typeof EventSource === "undefined") return

    const events = new EventSource("/api/config/events")
    const refresh = () => refreshCatalogSnapshot()
    events.addEventListener("config.changed", refresh)
    return () => {
      events.removeEventListener("config.changed", refresh)
      events.close()
    }
  }, [refreshCatalogSnapshot])
}

function createBridgeCatalogFactsSourceLayer(bridge: KorriPlatformBridge) {
  return Layer.succeed(CatalogFactsSource)({
    snapshot: (scope = "fabric") =>
      Effect.tryPromise({
        try: async () =>
          parseCatalogSnapshotFacts(
            await bridge.api.rpc("app.catalog.snapshot", { scope }),
          ),
        catch: error =>
          new CatalogFactsError({
            reason: "unavailable",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
  })
}

function parseCatalogSnapshotFacts(value: unknown): CatalogSnapshotFacts {
  if (
    typeof value !== "object" ||
    value === null ||
    !("entries" in value) ||
    !Array.isArray(value.entries) ||
    !("peers" in value) ||
    !Array.isArray(value.peers) ||
    !("health" in value) ||
    typeof value.health !== "object" ||
    value.health === null
  ) {
    throw new Error("app.catalog.snapshot: unexpected response shape")
  }
  return value as CatalogSnapshotFacts
}

function createBridgeLibrarySourceLayer(bridge: KorriPlatformBridge) {
  const listPlayableEntries = () =>
    Effect.tryPromise({
      try: () =>
        bridge.library.list() as Promise<readonly PlayableLibraryEntry[]>,
      catch: toLibraryError,
    })

  return Layer.succeed(LibrarySource)({
    list: () =>
      listPlayableEntries().pipe(
        Effect.map(entries => entries.map(playableToCompatGame)),
      ),
    listPlayableEntries,
    launchSpecFor: (id: string) => Effect.succeed(opaqueLaunchSpecFor(id)),
    resolveLaunchForGame: (id: string) =>
      Effect.succeed({ spec: opaqueLaunchSpecFor(id) }),
  })
}

function playableToCompatGame(entry: PlayableLibraryEntry): ResolvedGameRecord {
  const release = entry.releases[0]
  return {
    id: entry.id,
    system: release?.system ?? entry.system ?? "unknown",
    metadata: { name: entry.title ?? entry.id },
    ...(entry.media ? { media: entry.media } : {}),
  }
}

function createBridgeLauncherLayer(bridge: KorriPlatformBridge) {
  return Layer.succeed(Launcher)({
    run: (spec: LaunchSpec, options) =>
      Effect.tryPromise({
        try: async () => {
          await bridge.library.launch({
            id: spec.command,
            source: options?.source,
          })
          return { status: "launched" as const }
        },
        catch: toLibraryError,
      }),
  })
}

function createBridgeForegroundSessionLayer(bridge: KorriPlatformBridge) {
  return Layer.succeed(ForegroundSessionStatusSource)({
    get: () => Effect.promise(() => bridge.foregroundSession.get()),
  })
}

function opaqueLaunchSpecFor(id: string): LaunchSpec {
  return { command: id, args: [] }
}

function LiveUsbArtifactNotice({
  artifact,
}: {
  readonly artifact?: LiveUsbArtifact
}) {
  if (artifact !== "developer") return null

  return (
    <aside
      aria-label="Live USB artifact"
      className="pointer-events-none fixed right-4 top-4 z-50 rounded-full border border-amber-300/50 bg-amber-950/90 px-4 py-2 text-sm font-semibold tracking-wide text-amber-100 shadow-lg shadow-black/30"
    >
      <span>Developer ISO</span>
      <span className="ml-2 text-amber-200/80">broad persistence</span>
    </aside>
  )
}

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}
