import { LauncherLayerBridge } from "@app/features/home/launcher-layer-bridge"
import { LibrarySourceLayerRpc } from "@app/features/home/library-source-layer-rpc"
import { useAtomSet } from "@effect/atom-react"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@shared/library/library-atoms"
import { type ReactNode, useLayoutEffect, useState } from "react"

export function HomeServerRoot({ children }: { readonly children: ReactNode }) {
  const setLibrarySourceLayer = useAtomSet(librarySourceLayerAtom)
  const setLauncherLayer = useAtomSet(launcherLayerAtom)
  const [layersReady, setLayersReady] = useState(false)

  useLayoutEffect(() => {
    setLibrarySourceLayer(LibrarySourceLayerRpc)
    // Launch path goes through the desktop's bun-side bridge
    // (prepare-stream RPC → local Moonlight). See
    // `korri/deploy/desktop/launch-bridge.ts` for the bun handler
    // and `launcher-layer-bridge.ts` for the renderer-side fetch.
    // `LauncherLayerRpc` is still available for environments where the
    // server should directly spawn the game (CLI / non-streaming hosts).
    setLauncherLayer(LauncherLayerBridge)
    setLayersReady(true)
  }, [setLibrarySourceLayer, setLauncherLayer])

  return layersReady ? children : null
}
