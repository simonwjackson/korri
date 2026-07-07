import { afterEach, describe, expect, it } from "bun:test"
import { ShiftStoreSpotlightStates } from "@product/surfaces/web/shift/pages/ShiftStore.template.part"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { LabDraggablePart } from "@simonwjackson/caliper/test-support"
import { LabPartPreview } from "@simonwjackson/caliper/test-support"
import { LabContext, type LabContextValue } from "@simonwjackson/caliper/test-support"
import type { LabCalibrationController } from "@simonwjackson/caliper/test-support"
import { clearLabSurfaceRegistries } from "@simonwjackson/caliper/adapter-kit"
import { shiftLabSurfaceAdapter } from "./shift"

afterEach(() => {
  cleanup()
  clearLabSurfaceRegistries()
})

const calibration: LabCalibrationController = {
  setPxPerMm: () => undefined,
  patchDevice: () => undefined,
  addDevice: () => undefined,
  removeDevice: () => undefined,
  setKnob: () => undefined,
  reset: () => undefined,
  storageKey: "shift",
}

const context: LabContextValue = {
  adapter: shiftLabSurfaceAdapter,
  initialValues: {},
  themeId: "shift",
  surfacePath: "/",
  screens: [],
  selection: { kind: "set", ids: [] },
  devices: shiftLabSurfaceAdapter.devices,
  selectedDevices: [],
  pxPerMm: 1,
  knobValues: {},
  calibration,
  setDevicesSegment: () => undefined,
  setThemeId: () => undefined,
  setSurfacePath: () => undefined,
}

describe("Store — Spotlight in the lab", () => {
  it("renders the placed Spotlight variant through the real board path", async () => {
    const story = ShiftStoreSpotlightStates[0]
    if (!story) throw new Error("expected a Store — Spotlight Ready story")

    render(
      <LabContext.Provider value={context}>
        <LabDraggablePart
          instance={{
            kind: "placed-part",
            id: "object-store",
            storyId: story.id,
            sourceId: "dev",
            inputValues: {},
          }}
          story={story}
          byId={new Map([[story.id, story]])}
          scale={1}
          selected={false}
          pickMode={false}
          innerSelection={null}
          onSelect={() => undefined}
          onInnerSelect={() => undefined}
          onBind={() => undefined}
          onMove={() => undefined}
          onFrameResize={() => undefined}
          onFrameDevice={() => undefined}
          onRemove={() => undefined}
        />
      </LabContext.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText("Search the store")).toBeTruthy()
    })
  })

  it("renders the Spotlight surface template through the gallery preview path", async () => {
    const story = ShiftStoreSpotlightStates[0]
    if (!story) throw new Error("expected a Store — Spotlight Ready story")

    render(
      <LabContext.Provider value={context}>
        <LabPartPreview story={story} />
      </LabContext.Provider>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText("Search the store")).toBeTruthy()
    })
  })
})
