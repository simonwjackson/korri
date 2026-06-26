import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import {
  type CatalogSnapshotFacts,
  makeInMemoryCatalogFactsSourceLayer,
} from "@platform/catalog/catalog-facts-source"
import { DualScreenSessionRoot } from "@platform/react/display/dual-screen/DualScreenSessionRoot"
import { useDualScreenSession } from "@platform/react/display/dual-screen/DualScreenSession.context"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useLayoutEffect } from "react"
import { setShiftCatalogPreview } from "../shift-catalog-preview"
import { shiftCatalogStateSamples } from "../shift-catalog-state-samples"
import { ShiftCompanionRoute } from "./ShiftCompanionRoute"

function readyFacts(): CatalogSnapshotFacts {
  return {
    entries: [entry("hollow-knight", "Hollow Knight"), entry("celeste", "Celeste")],
    peers: [
      {
        hostId: "self",
        displayName: "self",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
        caps: ["source"],
        status: "ready",
        entryCount: 2,
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
    generation: 1,
    updatedAt: "2026-06-13T00:00:00.000Z",
    health: {
      coordinatorReachable: true,
      self: "ready",
      loadingPeers: 0,
      readyPeers: 1,
      failedPeers: 0,
      generation: 1,
    },
  }
}

function entry(id: string, title: string): CatalogSnapshotFacts["entries"][number] {
  return {
    id,
    itemId: id,
    title,
    releases: [{ id: "default", system: "steam", launchable: true }],
    launchable: true,
    media: [
      {
        role: "tile",
        type: "image",
        width: 600,
        height: 900,
        assetId: `${id}-tile`,
        url: `${id}.png`,
      },
    ],
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  }
}

function CompanionUnderTest({
  facts = readyFacts(),
  initialGameId = null,
  controls = false,
}: {
  readonly facts?: CatalogSnapshotFacts
  readonly initialGameId?: string | null
  readonly controls?: boolean
}) {
  const setLayer = useAtomSet(catalogFactsSourceLayerAtom)
  useLayoutEffect(() => {
    setLayer(makeInMemoryCatalogFactsSourceLayer(facts))
  }, [setLayer, facts])
  return (
    <DualScreenSessionRoot initialGameId={initialGameId} initialSource="primary">
      {controls ? <SessionControls /> : null}
      <ShiftCompanionRoute />
    </DualScreenSessionRoot>
  )
}

function SessionControls() {
  const { focusGame } = useDualScreenSession()
  return (
    <button type="button" onClick={() => focusGame("celeste", "primary")}>
      Focus Celeste
    </button>
  )
}

function renderCompanion(props: Parameters<typeof CompanionUnderTest>[0] = {}) {
  return render(
    <RegistryProvider>
      <CompanionUnderTest {...props} />
    </RegistryProvider>,
  )
}

afterEach(() => {
  setShiftCatalogPreview(null)
  cleanup()
})

describe("ShiftCompanionRoute", () => {
  it("waits for the primary selection instead of inventing a game", () => {
    renderCompanion()

    expect(screen.getByText("Waiting for primary selection.")).toBeTruthy()
    expect(screen.queryByText("Hollow Knight")).toBeNull()
  })

  it("renders detail for the selected game", async () => {
    renderCompanion({ initialGameId: "hollow-knight" })

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hollow Knight" })).toBeTruthy()
    })
  })

  it("updates when the shared selection changes", async () => {
    renderCompanion({ initialGameId: "hollow-knight", controls: true })

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hollow Knight" })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: "Focus Celeste" }))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Celeste" })).toBeTruthy()
    })
  })

  it("renders a safe not-found state for missing selected games", async () => {
    renderCompanion({ initialGameId: "missing-game" })

    await waitFor(() => {
      expect(screen.getByText("Game not found.")).toBeTruthy()
    })
  })

  it("does not use the design-tool catalog preview as its data source", async () => {
    setShiftCatalogPreview(shiftCatalogStateSamples.Empty())

    renderCompanion({ initialGameId: "hollow-knight" })

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hollow Knight" })).toBeTruthy()
    })
    expect(screen.queryByText("No games found.")).toBeNull()
  })
})
