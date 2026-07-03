import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import { makeInMemoryLibrarySourceLayer } from "@platform/library/library-source-layer-memory"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import type { ForegroundSessionGateState } from "@platform/session/foreground-session-gate-state"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { useLayoutEffect } from "react"
import {
  shiftCatalogFixtureEntries,
  shiftCatalogSourceLayers,
} from "../shift-catalog-state-samples"
import { readShiftCurrentCoordinate } from "../shift-current-coordinate"
import { shiftForegroundSourceLayers } from "../shift-foreground-preview"
import { ShiftHomeRoute } from "./ShiftHomeRoute"

/**
 * Data and foreground are driven through their REAL edges. Launch is produced by
 * interacting with the real launch controller against an in-memory
 * LibrarySource/Launcher, not by injecting a preview singleton.
 */
type ForegroundTag = ForegroundSessionGateState["_tag"]

function ReadyHome({ foreground }: { readonly foreground?: ForegroundTag }) {
  const setCatalog = useAtomSet(catalogFactsSourceLayerAtom)
  const setForeground = useAtomSet(foregroundSessionStatusLayerAtom)
  const setLibrarySource = useAtomSet(librarySourceLayerAtom)
  const setLauncher = useAtomSet(launcherLayerAtom)
  useLayoutEffect(() => {
    setCatalog(shiftCatalogSourceLayers.Ready())
    setLibrarySource(
      makeInMemoryLibrarySourceLayer({
        playableEntries: shiftCatalogFixtureEntries,
      }),
    )
    setLauncher(makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }))
    if (foreground) setForeground(shiftForegroundSourceLayers[foreground]())
  }, [setCatalog, setForeground, setLibrarySource, setLauncher, foreground])
  return <ShiftHomeRoute />
}

function EmptyHome() {
  const setCatalog = useAtomSet(catalogFactsSourceLayerAtom)
  useLayoutEffect(() => {
    setCatalog(shiftCatalogSourceLayers.Empty())
  }, [setCatalog])
  return <ShiftHomeRoute />
}

afterEach(cleanup)

describe("ShiftHomeRoute produced launch + foreground over the real edges", () => {
  it("does not turn request acceptance alone into now-playing feedback", async () => {
    render(
      <RegistryProvider>
        <ReadyHome />
      </RegistryProvider>,
    )

    const firstGame = await screen.findByRole("button", {
      name: /Hollow Knight/i,
    })
    fireEvent.click(firstGame)

    await waitFor(() => {
      expect(readShiftCurrentCoordinate("/").launch).toBe("Accepted")
    })
    expect(screen.queryByText("Now playing")).toBeNull()
    expect(readShiftCurrentCoordinate("/").launch).toBe("Accepted")
  })

  it("hides launch feedback when Data is not Ready", async () => {
    render(
      <RegistryProvider>
        <EmptyHome />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("No games found.")).toBeTruthy()
    })
    expect(screen.queryByText("Starting…")).toBeNull()
  })

  it("renders foreground feedback through the route's real edge", async () => {
    render(
      <RegistryProvider>
        <ReadyHome foreground="Cooling" />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("Couldn't start")).toBeTruthy()
    })
    expect(screen.getByText("Another game is running")).toBeTruthy()
  })

  it("renders now-playing from foreground Running while launch remains idle", async () => {
    render(
      <RegistryProvider>
        <ReadyHome foreground="Running" />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("Now playing")).toBeTruthy()
    })
    expect(readShiftCurrentCoordinate("/")).toMatchObject({
      launch: "Idle",
      foreground: "Running",
    })
  })
})
