import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import {
  type CatalogSnapshotFacts,
  makeInMemoryCatalogFactsSourceLayer,
} from "@platform/catalog/catalog-facts-source"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { useLayoutEffect } from "react"
import { setShiftCatalogPreview } from "../shift-catalog-preview"
import { shiftCatalogStateSamples } from "../shift-catalog-state-samples"
import { readShiftCurrentCoordinate } from "../shift-current-coordinate"
import {
  foregroundStateSamples,
  setShiftForegroundPreview,
} from "../shift-foreground-preview"
import {
  launchStateSamples,
  setShiftLaunchPreview,
} from "../shift-launch-preview"
import { ShiftHomeRoute } from "./ShiftHomeRoute"

function readyFacts(): CatalogSnapshotFacts {
  return {
    entries: [
      {
        id: "downwell",
        itemId: "downwell",
        title: "Downwell",
        releases: [{ id: "default", system: "steam", launchable: true }],
        launchable: true,
        source: {
          hostId: "self",
          controlUrl: "http://127.0.0.1:3001",
          isLocal: true,
        },
      },
    ],
    peers: [
      {
        hostId: "self",
        displayName: "self",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
        caps: ["source"],
        status: "ready",
        entryCount: 1,
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

function HomeUnderTest({ facts }: { readonly facts: CatalogSnapshotFacts }) {
  const setLayer = useAtomSet(catalogFactsSourceLayerAtom)
  useLayoutEffect(() => {
    setLayer(makeInMemoryCatalogFactsSourceLayer(facts))
  }, [setLayer, facts])
  return <ShiftHomeRoute />
}

function renderHome(facts: CatalogSnapshotFacts = readyFacts()): {
  readonly container: HTMLElement
} {
  const { container } = render(
    <RegistryProvider>
      <HomeUnderTest facts={facts} />
    </RegistryProvider>,
  )
  return { container }
}

// No seeded live layer: the data axis is driven purely by the preview pin, so
// the first cinematic render already carries the pinned launch state. (A seeded
// live layer would first resolve to an Idle "Ready to play" frame, which
// AnimatePresence mode="wait" then blocks from transitioning in jsdom/happy-dom.)
function renderBareHome(): void {
  render(
    <RegistryProvider>
      <ShiftHomeRoute />
    </RegistryProvider>,
  )
}

afterEach(() => {
  setShiftCatalogPreview(null)
  setShiftLaunchPreview(null)
  setShiftForegroundPreview(null)
  cleanup()
})

describe("ShiftHomeRoute catalog preview override", () => {
  it("renders the pinned data state, then returns to the real loader on release", async () => {
    renderHome()

    act(() => setShiftCatalogPreview(shiftCatalogStateSamples.Empty()))
    expect(screen.getByText("No games found.")).toBeTruthy()

    act(() => setShiftCatalogPreview(null))
    await waitFor(() => {
      expect(screen.getByText("Downwell")).toBeTruthy()
    })
    expect(screen.queryByText("No games found.")).toBeNull()
  })

  it("renders a pinned LoadError with a Retry that does not clear the pin", () => {
    renderHome()

    act(() => setShiftCatalogPreview(shiftCatalogStateSamples.LoadError()))
    expect(screen.getByText("Could not load library.")).toBeTruthy()

    const retry = screen.getByRole("button", { name: "Retry" })
    act(() => fireEvent.click(retry))

    // Retry refreshes the live loader but the design-tool pin persists.
    expect(screen.getByText("Could not load library.")).toBeTruthy()
  })

  it("rides the launch pin only when the data axis is Ready", () => {
    renderBareHome()

    act(() => {
      setShiftCatalogPreview(shiftCatalogStateSamples.Ready())
      setShiftLaunchPreview(launchStateSamples.Launching())
    })
    // The cinematic home's launch overlay ("Starting…") only exists in the
    // Ready body, so the launch pin and data pin ride together at Data=Ready.
    expect(screen.getByText("Starting\u2026")).toBeTruthy()

    act(() => setShiftCatalogPreview(shiftCatalogStateSamples.Empty()))
    expect(screen.getByText("No games found.")).toBeTruthy()
    expect(screen.queryByText("Starting\u2026")).toBeNull()
  })

  it("renders foreground preview feedback through the route", () => {
    renderBareHome()

    act(() => {
      setShiftCatalogPreview(shiftCatalogStateSamples.Ready())
      setShiftForegroundPreview(foregroundStateSamples.Cooling())
    })

    expect(screen.getByText("Couldn't start")).toBeTruthy()
    expect(screen.getByText("Another game is running")).toBeTruthy()
  })

  it("publishes the raw launch coordinate while foreground blocks display", () => {
    renderBareHome()

    act(() => {
      setShiftCatalogPreview(shiftCatalogStateSamples.Ready())
      setShiftForegroundPreview(foregroundStateSamples.Running())
    })

    expect(screen.getByText("Another game is running")).toBeTruthy()
    expect(readShiftCurrentCoordinate("/")).toMatchObject({
      launch: "Idle",
      foreground: "Running",
    })
  })

  it("keeps foreground live capture fresh when Data leaves Ready", async () => {
    renderBareHome()

    act(() => {
      setShiftCatalogPreview(shiftCatalogStateSamples.Ready())
      setShiftForegroundPreview(foregroundStateSamples.Running())
    })
    expect(readShiftCurrentCoordinate("/").foreground).toBe("Running")

    act(() => {
      setShiftCatalogPreview(shiftCatalogStateSamples.Empty())
      setShiftForegroundPreview(null)
    })

    await waitFor(() => {
      expect(readShiftCurrentCoordinate("/").foreground).toBe("Ready")
    })
  })
})
