import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import {
  CatalogFactsError,
  CatalogFactsSource,
  type CatalogSnapshotFacts,
  loadingForeverCatalogFactsSourceLayer,
  makeInMemoryCatalogFactsSourceLayer,
} from "@platform/catalog/catalog-facts-source"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { useDualScreenSession } from "@platform/react/display/dual-screen/DualScreenSession.context"
import { DualScreenSessionRoot } from "@platform/react/display/dual-screen/DualScreenSessionRoot"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { Effect, type Layer as EffectLayer, Layer } from "effect"
import { useLayoutEffect } from "react"
import { ShiftCompanionRoute } from "./ShiftCompanionRoute"

function readyFacts(): CatalogSnapshotFacts {
  return {
    entries: [
      entry("hollow-knight", "Hollow Knight"),
      entry("celeste", "Celeste"),
    ],
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

function entry(
  id: string,
  title: string,
): CatalogSnapshotFacts["entries"][number] {
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

type CatalogLayer = EffectLayer.Layer<CatalogFactsSource>

function CompanionUnderTest({
  facts = readyFacts(),
  layer,
  initialGameId = null,
  controls = false,
}: {
  readonly facts?: CatalogSnapshotFacts
  readonly layer?: CatalogLayer
  readonly initialGameId?: string | null
  readonly controls?: boolean
}) {
  const setLayer = useAtomSet(catalogFactsSourceLayerAtom)
  useLayoutEffect(() => {
    setLayer(layer ?? makeInMemoryCatalogFactsSourceLayer(facts))
  }, [setLayer, facts, layer])
  return (
    <DualScreenSessionRoot
      initialGameId={initialGameId}
      initialSource="primary"
    >
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

function emptyFacts(): CatalogSnapshotFacts {
  return { ...readyFacts(), entries: [] }
}

const loadErrorLayer: CatalogLayer = Layer.succeed(CatalogFactsSource)({
  snapshot: () =>
    Effect.fail(
      new CatalogFactsError({
        reason: "unavailable",
        message: "offline",
      }),
    ),
})

const defectLayer: CatalogLayer = Layer.succeed(CatalogFactsSource)({
  snapshot: () => Effect.die("boom"),
})

afterEach(() => {
  cleanup()
})

describe("ShiftCompanionRoute", () => {
  it("renders loading state without inventing a game", () => {
    renderCompanion({ layer: loadingForeverCatalogFactsSourceLayer })

    expect(screen.getByText("Loading library…")).toBeTruthy()
    expect(screen.queryByText("Waiting for primary selection.")).toBeNull()
    expect(screen.queryByText("Hollow Knight")).toBeNull()
  })

  it("renders load error state without inventing a game", async () => {
    renderCompanion({ layer: loadErrorLayer })

    await waitFor(() => {
      expect(screen.getByText("Could not load library.")).toBeTruthy()
    })
    expect(screen.queryByText("Waiting for primary selection.")).toBeNull()
    expect(screen.queryByText("Hollow Knight")).toBeNull()
  })

  it("renders defect state without inventing a game", async () => {
    renderCompanion({ layer: defectLayer })

    await waitFor(() => {
      expect(screen.getByText("Unexpected defect.")).toBeTruthy()
    })
    expect(screen.queryByText("Waiting for primary selection.")).toBeNull()
    expect(screen.queryByText("Hollow Knight")).toBeNull()
  })

  it("renders empty state without inventing a game", async () => {
    renderCompanion({ facts: emptyFacts() })

    await waitFor(() => {
      expect(screen.getByText("No games found.")).toBeTruthy()
    })
    expect(screen.queryByText("Waiting for primary selection.")).toBeNull()
    expect(screen.queryByText("Hollow Knight")).toBeNull()
  })

  it("waits for the primary selection instead of inventing a game", () => {
    renderCompanion()

    expect(screen.getByText("Waiting for primary selection.")).toBeTruthy()
    expect(screen.queryByText("Hollow Knight")).toBeNull()
  })

  it("renders detail for the selected game", async () => {
    renderCompanion({ initialGameId: "hollow-knight" })

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Hollow Knight" }),
      ).toBeTruthy()
    })
  })

  it("updates when the shared selection changes", async () => {
    renderCompanion({ initialGameId: "hollow-knight", controls: true })

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Hollow Knight" }),
      ).toBeTruthy()
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
})
