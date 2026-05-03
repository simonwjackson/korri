import { LauncherLayerRpc } from "@app/features/home/launcher-layer-rpc"
import { LibrarySourceLayerRpc } from "@app/features/home/library-source-layer-rpc"
import { useAtomSet } from "@effect/atom-react"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@shared/library/library-atoms"
import { type ReactNode, useLayoutEffect } from "react"

export function HomeServerRoot({ children }: { readonly children: ReactNode }) {
  const setLibrarySourceLayer = useAtomSet(librarySourceLayerAtom)
  const setLauncherLayer = useAtomSet(launcherLayerAtom)

  useLayoutEffect(() => {
    setLibrarySourceLayer(LibrarySourceLayerRpc)
    setLauncherLayer(LauncherLayerRpc)
  }, [setLibrarySourceLayer, setLauncherLayer])

  return <>{children}</>
}
