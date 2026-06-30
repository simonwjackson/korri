import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import type { Story } from "../../types"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabCalibrationController } from "../model/lab-calibration-state"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabDraggablePart } from "./LabDraggablePart"

afterEach(cleanup)

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
  initialCanvasView: "compose",
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
            id: "object-1",
            storyId: "detail-continue",
            sourceId: "dev",
            inputValues: { variant: "Play" },
          }}
          story={continueStory}
          byId={stories}
          scale={1}
          selected={false}
          onSelect={() => undefined}
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
            id: "object-1",
            storyId: "atom-pill",
            sourceId: "dev",
            inputValues: {},
          }}
          story={atomStory}
          byId={stories}
          scale={1}
          selected={false}
          onSelect={() => undefined}
          onBind={() => undefined}
          onMove={() => undefined}
          onRemove={mock(() => undefined)}
        />
      </LabContext.Provider>,
    )

    expect(screen.getByText("Adapter rendered atom")).toBeTruthy()
    expect(screen.queryByText("Atom baked render")).toBeNull()
  })
})
