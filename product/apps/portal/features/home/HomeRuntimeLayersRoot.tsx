import { useAtomInitialValues, useAtomRefresh } from "@effect/atom-react"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  libraryItemsAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { ForegroundSessionStatusLayerFixture } from "@product/apps/portal/features/home/foreground-session-status-layer-fixture"
import { ForegroundSessionStatusLayerLive } from "@product/apps/portal/features/home/foreground-session-status-layer-live"
import { HomeLiveUsbArtifactNotice } from "@product/apps/portal/features/home/HomeLiveUsbArtifactNotice"
import { LauncherLayerRpc } from "@product/apps/portal/features/home/launcher-layer-rpc"
import { LibrarySourceLayerRpc } from "@product/apps/portal/features/home/library-source-layer-rpc"
import { type ReactNode, useEffect } from "react"

type LiveUsbArtifact = "product" | "developer"

/**
 * Route-local layer seeding keeps the atom writes in the same code-split
 * runtime chunk as the page hooks that read them. Seeding only from
 * `portal/main.tsx` can leave lazy route chunks reading the default atom
 * registry, which parks the library source on the loading placeholder.
 */
export function HomeRuntimeLayersRoot({
  children,
}: {
  readonly children: ReactNode
}) {
  const runtimeConfig = readRuntimeConfig(window)
  const desktopInput = runtimeConfig.desktopInput

  useAtomInitialValues([
    [librarySourceLayerAtom, LibrarySourceLayerRpc],
    [launcherLayerAtom, LauncherLayerRpc],
    [
      foregroundSessionStatusLayerAtom,
      desktopInput
        ? ForegroundSessionStatusLayerLive
        : ForegroundSessionStatusLayerFixture,
    ],
  ] as const)

  return (
    <>
      <ConfigChangeRefreshBridge />
      <HomeLiveUsbArtifactNotice artifact={runtimeConfig.liveUsbArtifact} />
      {children}
    </>
  )
}

/**
 * Refresh config-derived library atoms when KORRID's config graph changes.
 * Listening to `config.ready` as well as `config.changed` means a reconnecting
 * client also re-syncs. `config.invalid` is intentionally ignored so the GUI
 * keeps showing the last good catalog (client-side last-known-good).
 */
function ConfigChangeRefreshBridge() {
  const refreshLibraryItems = useAtomRefresh(libraryItemsAtom)

  useEffect(() => {
    if (typeof EventSource === "undefined") return
    const events = new EventSource("/api/config/events")
    const refresh = () => refreshLibraryItems()
    events.addEventListener("config.changed", refresh)
    events.addEventListener("config.ready", refresh)
    return () => {
      events.removeEventListener("config.changed", refresh)
      events.removeEventListener("config.ready", refresh)
      events.close()
    }
  }, [refreshLibraryItems])

  return null
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
