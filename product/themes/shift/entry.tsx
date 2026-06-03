import { RegistryProvider } from "@effect/atom-react"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import type {
  KorriPlatformBridge,
  KorriThemeEntrypoint,
} from "@platform/theme/bridge"
import type { ResolvedGameRecord } from "@shared/fixtures/games/game"
import type { LaunchSpec } from "@shared/library/launcher"
import {
  Launcher,
  LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { ForegroundSessionStatusSource } from "@shared/stream/foreground-session-status-source"
import { Effect, Layer } from "effect"
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
      <RegistryProvider initialValues={initialValues}>
        <LiveUsbArtifactNotice />
        <ShiftHomePage />
      </RegistryProvider>,
    )

    return () => root.unmount()
  },
}

export default shiftTheme

function createBridgeLibrarySourceLayer(bridge: KorriPlatformBridge) {
  return Layer.succeed(LibrarySource)({
    list: () =>
      Effect.tryPromise({
        try: () =>
          bridge.library.list() as Promise<readonly ResolvedGameRecord[]>,
        catch: toLibraryError,
      }),
    launchSpecFor: (id: string) => Effect.succeed(opaqueLaunchSpecFor(id)),
    resolveLaunchForGame: (id: string) =>
      Effect.succeed({ spec: opaqueLaunchSpecFor(id) }),
  })
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
