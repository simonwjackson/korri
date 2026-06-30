import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { foregroundSessionStatusLayerAtom } from "@platform/react/library/library-atoms"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { useLayoutEffect } from "react"
import { shiftCatalogSourceLayers } from "../shift-catalog-state-samples"
import { readShiftCurrentCoordinate } from "../shift-current-coordinate"
import { shiftForegroundSourceLayers } from "../shift-foreground-preview"
import {
  launchStateSamples,
  setShiftLaunchPreview,
} from "../shift-launch-preview"
import { ShiftHomeRoute } from "./ShiftHomeRoute"

/**
 * Data and foreground are driven through their REAL edges
 * (`catalogFactsSourceLayerAtom`, `foregroundSessionStatusLayerAtom`) — no
 * preview side channel. The launch preview singleton (still in use, pending its
 * own migration) is set before render so the first cinematic frame carries it.
 */
type ForegroundTag = ForegroundSessionGateState["_tag"]

function ReadyHome({ foreground }: { readonly foreground?: ForegroundTag }) {
  const setCatalog = useAtomSet(catalogFactsSourceLayerAtom)
  const setForeground = useAtomSet(foregroundSessionStatusLayerAtom)
  useLayoutEffect(() => {
    setCatalog(shiftCatalogSourceLayers.Ready())
    if (foreground) setForeground(shiftForegroundSourceLayers[foreground]())
  }, [setCatalog, setForeground, foreground])
  return <ShiftHomeRoute />
}

function EmptyHome() {
  const setCatalog = useAtomSet(catalogFactsSourceLayerAtom)
  useLayoutEffect(() => {
    setCatalog(shiftCatalogSourceLayers.Empty())
  }, [setCatalog])
  return <ShiftHomeRoute />
}

afterEach(() => {
  setShiftLaunchPreview(null)
  cleanup()
})

describe("ShiftHomeRoute launch + foreground over the real edges", () => {
  it("rides the launch pin on the cinematic home when Data is Ready", async () => {
    setShiftLaunchPreview(launchStateSamples.Launching())
    render(
      <RegistryProvider>
        <ReadyHome />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("Starting\u2026")).toBeTruthy()
    })
  })

  it("hides the launch overlay when Data is not Ready", async () => {
    setShiftLaunchPreview(launchStateSamples.Launching())
    render(
      <RegistryProvider>
        <EmptyHome />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("No games found.")).toBeTruthy()
    })
    expect(screen.queryByText("Starting\u2026")).toBeNull()
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

  it("publishes the raw launch coordinate while foreground blocks display", async () => {
    render(
      <RegistryProvider>
        <ReadyHome foreground="Running" />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("Another game is running")).toBeTruthy()
    })
    expect(readShiftCurrentCoordinate("/")).toMatchObject({
      launch: "Idle",
      foreground: "Running",
    })
  })
})
