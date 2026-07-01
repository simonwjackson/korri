import {
  RegistryProvider,
  useAtomInitialValues,
  useAtomRefresh,
  useAtomSet,
} from "@effect/atom-react"
import {
  catalogFactsSourceLayerAtom,
  catalogSnapshotAtom,
} from "@platform/react/catalog/catalog-atoms"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import {
  deviceFactsSourceLayerAtom,
  deviceStateAtom,
} from "@platform/react/device/device-atoms"
import { CatalogFactsSourceLayerRpc } from "@product/apps/portal/features/home/catalog-source-layer-rpc"
import {
  DeviceFactsLayerLive,
  parseDeviceEventState,
} from "@product/apps/portal/features/home/device-facts-layer-live"
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

  return (
    <RegistryProvider>
      <HomeRuntimeLayersInner runtimeConfig={runtimeConfig}>
        {children}
      </HomeRuntimeLayersInner>
    </RegistryProvider>
  )
}

function HomeRuntimeLayersInner({
  children,
  runtimeConfig,
}: {
  readonly children: ReactNode
  readonly runtimeConfig: ReturnType<typeof readRuntimeConfig>
}) {
  const desktopInput = runtimeConfig.desktopInput

  useAtomInitialValues([
    [catalogFactsSourceLayerAtom, CatalogFactsSourceLayerRpc],
    [librarySourceLayerAtom, LibrarySourceLayerRpc],
    [launcherLayerAtom, LauncherLayerRpc],
    [deviceFactsSourceLayerAtom, DeviceFactsLayerLive],
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
      <DeviceFactsSubscriptionBridge />
      <HomeLiveUsbArtifactNotice artifact={runtimeConfig.liveUsbArtifact} />
      {children}
    </>
  )
}

/**
 * Refresh config-derived library atoms when KORRID's config graph changes.
 * A one-shot mount refresh covers atom reads that began before route-local
 * layers were seeded. The first `config.ready` is treated as an initial sync
 * point because desktop startup can render before KORRID is reachable. Later
 * `config.ready` events are
 * ignored: desktop-forwarded SSE streams can reconnect, and treating every
 * reconnect as a catalog mutation can keep the home rail in a refresh/loading
 * loop. `config.invalid` is also ignored so the GUI keeps showing the last good
 * catalog (client-side last-known-good).
 */
function DeviceFactsSubscriptionBridge() {
  const setDeviceState = useAtomSet(deviceStateAtom)

  useEffect(() => {
    const bridge = window.korri?.device
    if (bridge) {
      // The subscription is current-state-first; avoid a separate snapshot call
      // that can resolve later and overwrite a newer streamed state.
      return bridge.subscribe(setDeviceState)
    }

    if (typeof EventSource === "undefined") return undefined
    const events = new EventSource("/api/device/events")
    const onState = (event: MessageEvent) => {
      const state = parseDeviceEventState(event.data)
      if (state) setDeviceState(state)
    }
    events.addEventListener("device.state", onState)
    return () => {
      events.removeEventListener("device.state", onState)
      events.close()
    }
  }, [setDeviceState])

  return null
}

function ConfigChangeRefreshBridge() {
  const refreshCatalogSnapshot = useAtomRefresh(catalogSnapshotAtom)

  useEffect(() => {
    const timers = [window.setTimeout(() => refreshCatalogSnapshot(), 0)]

    if (typeof EventSource === "undefined") {
      return () => {
        for (const timer of timers) window.clearTimeout(timer)
      }
    }

    const events = new EventSource("/api/config/events")
    const refresh = () => refreshCatalogSnapshot()
    let sawReady = false
    const refreshOnceWhenReady = () => {
      if (sawReady) return
      sawReady = true
      refreshCatalogSnapshot()
    }
    events.addEventListener("config.ready", refreshOnceWhenReady)
    events.addEventListener("config.changed", refresh)
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      events.removeEventListener("config.ready", refreshOnceWhenReady)
      events.removeEventListener("config.changed", refresh)
      events.close()
    }
  }, [refreshCatalogSnapshot])

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
