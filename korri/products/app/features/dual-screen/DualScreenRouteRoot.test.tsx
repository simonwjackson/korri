import { afterEach, describe, expect, it } from "bun:test"
import { useAtomSet } from "@effect/atom-react"
import { games } from "@shared/fixtures/games/games"
import { makeInMemoryLauncherLayer } from "@shared/library/launcher-layer-memory"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@shared/library/library-atoms"
import {
  loadingForeverLibrarySourceLayer,
  makeInMemoryLibrarySourceLayer,
} from "@shared/library/library-source-layer-memory"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { type ReactNode, useLayoutEffect } from "react"
import {
  DualScreenRouteRoot,
  parseDualScreenRouteRole,
} from "./DualScreenRouteRoot"

const routeGames = games.slice(0, 2)

afterEach(() => cleanup())

describe("DualScreenRouteRoot", () => {
  it("parses missing or invalid roles as primary", () => {
    expect(parseDualScreenRouteRole(undefined)).toBe("primary")
    expect(parseDualScreenRouteRole("unknown")).toBe("primary")
    expect(parseDualScreenRouteRole("companion")).toBe("companion")
  })

  it("renders the primary screen role from library data", async () => {
    render(<DualScreenRouteRoot screenRole="primary" session="memory" />, {
      wrapper: WithLibraryLayers,
    })

    await waitFor(() => {
      expect(screen.getByText("Crystalline Drift")).toBeTruthy()
    })
  })

  it("renders the companion screen role from library data", async () => {
    render(<DualScreenRouteRoot screenRole="companion" session="memory" />, {
      wrapper: WithLibraryLayers,
    })

    await waitFor(() => {
      expect(screen.getByText("Crystalline Drift")).toBeTruthy()
    })
  })
})

function WithLibraryLayers({ children }: { readonly children: ReactNode }) {
  const setSourceLayer = useAtomSet(librarySourceLayerAtom)
  const setLauncherLayer = useAtomSet(launcherLayerAtom)

  useLayoutEffect(() => {
    setSourceLayer(makeInMemoryLibrarySourceLayer({ games: routeGames }))
    setLauncherLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
    )
    return () => {
      setSourceLayer(loadingForeverLibrarySourceLayer)
      setLauncherLayer(
        makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
      )
    }
  }, [setSourceLayer, setLauncherLayer])

  return <>{children}</>
}
