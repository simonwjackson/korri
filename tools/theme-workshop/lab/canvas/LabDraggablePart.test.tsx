import { afterEach, describe, expect, it, mock } from "bun:test"
import { shiftClockIsoAtom } from "@product/surfaces/web/shift/shift-clock-state"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { Story } from "../../types"
import { shiftLabSurfaceAdapter } from "../adapters/shift"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabCalibrationController } from "../model/lab-calibration-state"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import {
  clearLabSurfaceRegistries,
  eachLabSurfaceRegistryForScope,
} from "../model/lab-surface-registries"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabDraggablePart } from "./LabDraggablePart"

afterEach(() => {
  cleanup()
  clearLabSurfaceRegistries()
})

const continueStory: Story = {
  id: "detail-continue",
  layer: "page",
  name: "Game Detail",
  note: "Action states",
  surface: true,
  state: "Continue",
  variants: ["detail-play"],
  render: () => <div>Continue story rendered</div>,
}

const playStory: Story = {
  id: "detail-play",
  layer: "page",
  name: "Game Detail",
  note: "Action states",
  surface: true,
  state: "Play",
  variants: ["detail-continue"],
  render: () => <div>Play story rendered</div>,
}

const atomStory: Story = {
  id: "atom-pill",
  layer: "atom",
  name: "Pill",
  render: () => <div>Atom baked render</div>,
}

const stories = new Map(
  [continueStory, playStory, atomStory].map(
    story => [story.id, story] as const,
  ),
)

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices: [],
  makeSeedInitialValues: async () => ({}),
  mountSurface: () => ({ router: {}, dispose: () => undefined }),
}

const calibration: LabCalibrationController = {
  setPxPerMm: () => undefined,
  patchDevice: () => undefined,
  addDevice: () => undefined,
  removeDevice: () => undefined,
  setKnob: () => undefined,
  reset: () => undefined,
  storageKey: "test",
}

const context: LabContextValue = {
  adapter,
  initialValues: {},
  themeId: "test",
  surfacePath: "/",
  screens: [],
  selection: { kind: "set", ids: [] },
  devices: [],
  selectedDevices: [],
  pxPerMm: 1,
  knobValues: {},
  calibration,
  setDevicesSegment: () => undefined,
  setThemeId: () => undefined,
  setSurfacePath: () => undefined,
}

describe("LabDraggablePart", () => {
  it("uses the variant input value to render the selected story variant", () => {
    render(
      <LabContext.Provider value={context}>
        <LabDraggablePart
          instance={{
            kind: "placed-part",
            id: "object-1",
            storyId: "detail-continue",
            sourceId: "dev",
            inputValues: { variant: "Play" },
          }}
          story={continueStory}
          byId={stories}
          scale={1}
          selected={false}
          pickMode={false}
          innerSelection={null}
          onSelect={() => undefined}
          onInnerSelect={() => undefined}
          onBind={() => undefined}
          onMove={() => undefined}
          onRemove={mock(() => undefined)}
        />
      </LabContext.Provider>,
    )

    expect(screen.getByText("Play story rendered")).toBeTruthy()
    expect(screen.queryByText("Continue story rendered")).toBeNull()
  })

  it("lets adapters render atom parts through their real inputs", () => {
    const adapterRendered = {
      ...adapter,
      renderSurfacePart: () => <div>Adapter rendered atom</div>,
    }

    render(
      <LabContext.Provider value={{ ...context, adapter: adapterRendered }}>
        <LabDraggablePart
          instance={{
            kind: "placed-part",
            id: "object-1",
            storyId: "atom-pill",
            sourceId: "dev",
            inputValues: {},
          }}
          story={atomStory}
          byId={stories}
          scale={1}
          selected={false}
          pickMode={false}
          innerSelection={null}
          onSelect={() => undefined}
          onInnerSelect={() => undefined}
          onBind={() => undefined}
          onMove={() => undefined}
          onRemove={mock(() => undefined)}
        />
      </LabContext.Provider>,
    )

    expect(screen.getByText("Adapter rendered atom")).toBeTruthy()
    expect(screen.queryByText("Atom baked render")).toBeNull()
  })

  it("mounts a live-mountable part on a scoped registry and drives it live", async () => {
    const homeStory: Story = {
      id: "shift-home",
      layer: "page",
      name: "Home",
      surface: true,
      render: () => null,
    }

    render(
      <LabContext.Provider
        value={{ ...context, adapter: shiftLabSurfaceAdapter }}
      >
        <LabDraggablePart
          instance={{
            kind: "placed-part",
            id: "object-live",
            storyId: "shift-home",
            sourceId: "cozy",
            inputValues: { variant: "Ready" },
          }}
          story={homeStory}
          byId={new Map([[homeStory.id, homeStory]])}
          scale={1}
          selected={false}
          pickMode={false}
          innerSelection={null}
          onSelect={() => undefined}
          onInnerSelect={() => undefined}
          onBind={() => undefined}
          onMove={() => undefined}
          onRemove={mock(() => undefined)}
        />
      </LabContext.Provider>,
    )

    // The real Home subtree renders from the seeded fixture library.
    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })

    // The part's registry is registered under the object's scope — driving a
    // real atom through the hub updates the mounted part live (no remount).
    act(() => {
      eachLabSurfaceRegistryForScope("object-live", ({ registry }) =>
        registry.set(shiftClockIsoAtom, "2026-06-30T23:08:00.000Z"),
      )
    })
    await waitFor(() => {
      expect(screen.getByText("11:08 PM")).toBeTruthy()
    })
  })

  it("delivers a scoped device event into a placed part's real pipeline", async () => {
    const homeStory: Story = {
      id: "shift-home",
      layer: "page",
      name: "Home",
      surface: true,
      render: () => null,
    }

    const { container } = render(
      <LabContext.Provider
        value={{ ...context, adapter: shiftLabSurfaceAdapter }}
      >
        <LabDraggablePart
          instance={{
            kind: "placed-part",
            id: "object-live",
            storyId: "shift-home",
            sourceId: "cozy",
            inputValues: { variant: "Ready" },
          }}
          story={homeStory}
          byId={new Map([[homeStory.id, homeStory]])}
          scale={1}
          selected={false}
          pickMode={false}
          innerSelection={null}
          onSelect={() => undefined}
          onInnerSelect={() => undefined}
          onBind={() => undefined}
          onMove={() => undefined}
          onRemove={mock(() => undefined)}
        />
      </LabContext.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })

    // Fire the part's own battery device event scoped to this placed part: it
    // lands in the part's registered registry and reaches the rendered battery
    // through the real device-state consumption path.
    const battery = shiftLabSurfaceAdapter
      .surfacePartEvents?.(homeStory)
      .find(event => event.id === "battery")
    expect(battery).toBeTruthy()
    act(() => {
      battery?.emit({ percent: 18, charging: true }, { scopeId: "object-live" })
    })
    await waitFor(() => {
      expect(container.querySelector(".lucide-battery-charging")).toBeTruthy()
    })
  })

  it("picks a named part inside a placed object without running the inner click", () => {
    const selections: LabPreviewSelection[] = []
    let innerClicks = 0
    const nestedStory: Story = {
      id: "home-page",
      layer: "page",
      name: "Home",
      surface: true,
      render: () => (
        <button
          type="button"
          data-korri-part="shift.battery"
          data-korri-layer="atom"
          data-korri-name="Battery"
          onClick={() => {
            innerClicks += 1
          }}
        >
          Battery
        </button>
      ),
    }

    render(
      <LabContext.Provider value={context}>
        <LabDraggablePart
          instance={{
            kind: "placed-part",
            id: "object-1",
            storyId: "home-page",
            sourceId: "dev",
            inputValues: {},
          }}
          story={nestedStory}
          byId={new Map([[nestedStory.id, nestedStory]])}
          scale={1}
          selected={false}
          pickMode
          innerSelection={null}
          onSelect={() => undefined}
          onInnerSelect={selection => {
            if (selection) selections.push(selection)
          }}
          onBind={() => undefined}
          onMove={() => undefined}
          onRemove={mock(() => undefined)}
        />
      </LabContext.Provider>,
    )

    const button = screen.getByRole("button", { name: "Battery" })
    fireEvent.pointerDown(button)
    fireEvent.click(button)

    expect(selections[0]?.targets[0]?.name).toBe("Battery")
    expect(innerClicks).toBe(0)
  })
})
