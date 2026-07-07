import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import type {
  CatalogEntry,
  CatalogFactsSource,
} from "@platform/catalog/catalog-facts-source"
import { makeCatalogStateSourceLayers } from "@platform/catalog/catalog-state-samples"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { Layer } from "effect"
import { useLayoutEffect } from "react"
import { shiftCatalogSourceLayers } from "../shift-catalog-state-samples"
import { ShiftHomeRoute } from "./ShiftHomeRoute"

/**
 * Proof of the real edge: the Home route renders every catalog data state, and
 * flips between them live, driven only by setting the surface's real source atom
 * (`catalogFactsSourceLayerAtom`) — the exact seam production injects the live
 * loader through. No preview singleton is involved. This is the "app unwrapped"
 * principle: swap the data at the edge, never add a tool-only mechanism.
 */

function HomeDrivenBySource({
  layer,
}: {
  readonly layer: Layer.Layer<CatalogFactsSource>
}) {
  const setSource = useAtomSet(catalogFactsSourceLayerAtom)
  useLayoutEffect(() => {
    setSource(layer)
  }, [setSource, layer])
  return <ShiftHomeRoute />
}

afterEach(cleanup)

describe("ShiftHomeRoute driven by the real catalog edge", () => {
  it("renders the Ready state from the real source layer", async () => {
    render(
      <RegistryProvider>
        <HomeDrivenBySource layer={shiftCatalogSourceLayers.Ready()} />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.queryByText("No games found.")).toBeNull()
    })
  })

  it("renders the Empty state from the real source layer", async () => {
    render(
      <RegistryProvider>
        <HomeDrivenBySource layer={shiftCatalogSourceLayers.Empty()} />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("No games found.")).toBeTruthy()
    })
  })

  it("renders the LoadError state from the real source layer", async () => {
    render(
      <RegistryProvider>
        <HomeDrivenBySource layer={shiftCatalogSourceLayers.LoadError()} />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("Could not load library.")).toBeTruthy()
    })
  })

  it("renders an arbitrary fixture set swapped in at the real edge", async () => {
    // A fixture set with none of the built-in dev games: proves the page is a
    // function of whatever data is plugged into the real edge, nothing baked in.
    const swapped = makeCatalogStateSourceLayers([
      labGame("aurora-drift", "Aurora Drift"),
      labGame("neon-harbor", "Neon Harbor"),
    ]).Ready()
    render(
      <RegistryProvider>
        <HomeDrivenBySource layer={swapped} />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
  })
})

function labGame(id: string, title: string): CatalogEntry {
  return {
    id,
    itemId: id,
    title,
    releases: [{ id: "default", system: "steam", launchable: true }],
    launchable: true,
    metadata: { name: title, genre: ["Adventure"], developer: "Lab Fixtures" },
    // Played so the games land in the home's "Recent" section (an unplayed set
    // would surface only a single Random pick).
    playStats: {
      lastPlayed: new Date("2026-07-01T00:00:00.000Z"),
      playCount: 1,
      totalPlaytimeSeconds: 300,
    },
    media: [
      {
        role: "tile",
        type: "image",
        assetId: `${id}-tile`,
        url: "https://example.test/tile.png",
        width: 600,
        height: 900,
      },
      {
        role: "banner",
        type: "image",
        assetId: `${id}-hero`,
        url: "https://example.test/hero.png",
        width: 1920,
        height: 620,
      },
    ],
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  }
}
