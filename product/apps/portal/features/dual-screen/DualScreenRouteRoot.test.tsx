import { afterEach, describe, expect, it } from "bun:test"
import { useAtomSet } from "@effect/atom-react"
import {
  loadingForeverCatalogFactsSourceLayer,
  makeInMemoryCatalogFactsSourceLayer,
} from "@platform/catalog/catalog-facts-source"
import { games } from "@platform/fixtures/games/games"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import { playableEntryFromResolvedGame } from "@platform/library/playable-library"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { launcherLayerAtom } from "@platform/react/library/library-atoms"
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
  const setSourceLayer = useAtomSet(catalogFactsSourceLayerAtom)
  const setLauncherLayer = useAtomSet(launcherLayerAtom)

  useLayoutEffect(() => {
    setSourceLayer(
      makeInMemoryCatalogFactsSourceLayer(snapshotWithRouteGames()),
    )
    setLauncherLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
    )
    return () => {
      setSourceLayer(loadingForeverCatalogFactsSourceLayer)
      setLauncherLayer(
        makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
      )
    }
  }, [setSourceLayer, setLauncherLayer])

  return <>{children}</>
}

function snapshotWithRouteGames() {
  const entries = routeGames.map(game => ({
    ...playableEntryFromResolvedGame(game),
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  }))
  return {
    entries,
    peers: [
      {
        hostId: "self",
        displayName: "self",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
        caps: ["source"],
        status: "ready" as const,
        entryCount: entries.length,
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
    generation: 1,
    updatedAt: "2026-06-13T00:00:00.000Z",
    health: {
      coordinatorReachable: true,
      self: "ready" as const,
      loadingPeers: 0,
      readyPeers: 0,
      failedPeers: 0,
      generation: 1,
    },
  }
}
