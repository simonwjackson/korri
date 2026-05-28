import { ForegroundSessionStatusLayerFixture } from "@app/features/home/foreground-session-status-layer-fixture"
import { ForegroundSessionStatusLayerLive } from "@app/features/home/foreground-session-status-layer-live"
import { HomeLiveUsbArtifactNotice } from "@app/features/home/HomeLiveUsbArtifactNotice"
import { LauncherLayerRpc } from "@app/features/home/launcher-layer-rpc"
import { LibrarySourceLayerRpc } from "@app/features/home/library-source-layer-rpc"
import { useAtomInitialValues } from "@effect/atom-react"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@shared/library/library-atoms"
import type { ReactNode } from "react"

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
      <HomeLiveUsbArtifactNotice artifact={runtimeConfig.liveUsbArtifact} />
      {children}
    </>
  )
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
