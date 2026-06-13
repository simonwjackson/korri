import {
  RegistryProvider,
  useAtomInitialValues,
  useAtomRefresh,
} from "@effect/atom-react"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { LaunchSpec } from "@platform/library/launcher"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import {
  Launcher,
  LibraryError,
  LibrarySource,
} from "@platform/library/library-services"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  libraryItemsAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { ForegroundSessionStatusSource } from "@platform/stream/foreground-session-status-source"
import type {
  KorriPlatformBridge,
  KorriThemeEntrypoint,
} from "@platform/theme/bridge"
import { Effect, Layer } from "effect"
import { useEffect } from "react"
import { createRoot } from "react-dom/client"
import { ShiftHomePage } from "./pages/ShiftHomePage"

export const shiftTheme: KorriThemeEntrypoint = {
  id: "shift",
  mount(host, { bridge }) {
    const root = createRoot(host)
    const initialValues = [
      [librarySourceLayerAtom, createBridgeLibrarySourceLayer(bridge)],
      [launcherLayerAtom, createBridgeLauncherLayer(bridge)],
      [
        foregroundSessionStatusLayerAtom,
        createBridgeForegroundSessionLayer(bridge),
      ],
    ] as const

    root.render(
      <RegistryProvider>
        <ShiftThemeRuntimeRoot initialValues={initialValues} />
      </RegistryProvider>,
    )

    return () => root.unmount()
  },
}

export default shiftTheme

function ShiftThemeRuntimeRoot({
  initialValues,
}: {
  readonly initialValues: Parameters<typeof useAtomInitialValues>[0]
}) {
  useAtomInitialValues(initialValues)
  useLibraryRefreshOnRuntimeReady()
  return (
    <>
      <LiveUsbArtifactNotice />
      <ShiftHomePage />
    </>
  )
}

function useLibraryRefreshOnRuntimeReady() {
  const refreshLibraryItems = useAtomRefresh(libraryItemsAtom)

  useEffect(() => {
    const timers = [window.setTimeout(() => refreshLibraryItems(), 0)]

    if (typeof EventSource !== "undefined") {
      const events = new EventSource("/api/config/events")
      const refresh = () => refreshLibraryItems()
      let sawReady = false
      const refreshOnceWhenReady = () => {
        if (sawReady) return
        sawReady = true
        refreshLibraryItems()
      }
      events.addEventListener("config.ready", refreshOnceWhenReady)
      events.addEventListener("config.changed", refresh)
      return () => {
        for (const timer of timers) window.clearTimeout(timer)
        events.removeEventListener("config.ready", refreshOnceWhenReady)
        events.removeEventListener("config.changed", refresh)
        events.close()
      }
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [refreshLibraryItems])
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

function LiveUsbArtifactNotice() {
  const artifact = (
    window as Window & {
      readonly __korriRuntimeConfig?: { readonly liveUsbArtifact?: unknown }
    }
  ).__korriRuntimeConfig?.liveUsbArtifact
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
