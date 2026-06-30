import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Story } from "../../types"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabCalibrationController } from "../model/lab-calibration-state"
import type { LabObjectInstance } from "../model/lab-canvas-state"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabObjectInspector } from "./LabObjectInspector"

afterEach(cleanup)

const homeReady: Story = {
  id: "home-ready",
  layer: "page",
  name: "Home",
  note: "Data states",
  surface: true,
  state: "Ready",
  variants: ["home-empty"],
  render: () => "ready",
}

const homeEmpty: Story = {
  id: "home-empty",
  layer: "page",
  name: "Home",
  note: "Data states",
  surface: true,
  state: "Empty",
  variants: ["home-ready"],
  render: () => "empty",
}

const detailContinue: Story = {
  id: "detail-continue",
  layer: "page",
  name: "Game Detail",
  note: "Action states",
  surface: true,
  state: "Continue",
  variants: ["detail-play"],
  render: () => "continue",
}

const detailPlay: Story = {
  id: "detail-play",
  layer: "page",
  name: "Game Detail",
  note: "Action states",
  surface: true,
  state: "Play",
  variants: ["detail-continue"],
  render: () => "play",
}

const pill: Story = {
  id: "pill",
  layer: "atom",
  name: "Pill",
  render: () => "pill",
}

const byId = new Map(
  [homeReady, homeEmpty, detailContinue, detailPlay, pill].map(
    story => [story.id, story] as const,
  ),
)

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices: [],
  surfacePartStateGroups: (story: Story) =>
    story.name === "Home"
      ? [
          {
            id: "foreground",
            label: "Foreground",
            defaultStateId: "Ready",
            states: [
              { id: "Ready", label: "Ready" },
              { id: "Running", label: "Running" },
            ],
          },
        ]
      : [],
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

function context(): LabContextValue {
  return {
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
}

function instance(
  storyId: string,
  stateGroupValues: LabObjectInstance["stateGroupValues"],
): LabObjectInstance {
  return {
    id: "object-1",
    storyId,
    sourceId: "dev",
    stateGroupValues,
  }
}

function renderInspector({
  story,
  object = instance(story.id, {}),
  onBind = mock(() => undefined),
  onBindStateGroup = mock(() => undefined),
}: {
  readonly story: Story
  readonly object?: LabObjectInstance
  readonly onBind?: (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId">>,
  ) => void
  readonly onBindStateGroup?: (
    id: string,
    groupId: string,
    stateId: string,
  ) => void
}) {
  render(
    <LabContext.Provider value={context()}>
      <LabObjectInspector
        instance={object}
        story={story}
        byId={byId}
        sources={[
          { id: "dev", label: "Dev" },
          { id: "cozy", label: "Cozy" },
        ]}
        onBind={onBind}
        onBindStateGroup={onBindStateGroup}
      />
    </LabContext.Provider>,
  )
  return { onBind, onBindStateGroup }
}

describe("LabObjectInspector", () => {
  it("shows Game Detail Action as a state group without Home-only Foreground", () => {
    renderInspector({ story: detailContinue })

    expect(screen.getByLabelText("Action for Game Detail")).toBeTruthy()
    expect(screen.queryByLabelText("State for Game Detail")).toBeNull()
    expect(screen.queryByLabelText("Foreground for Game Detail")).toBeNull()
  })

  it("shows Shift Home Data and Foreground as peer state groups", () => {
    renderInspector({
      story: homeReady,
      object: instance("home-ready", {
        variant: "Empty",
        foreground: "Running",
      }),
    })

    expect(screen.getByLabelText("Data for Home")).toHaveProperty(
      "value",
      "Empty",
    )
    expect(screen.getByLabelText("Foreground for Home")).toHaveProperty(
      "value",
      "Running",
    )
    expect(screen.queryByLabelText("State for Home")).toBeNull()
  })

  it("sends every state group through the same binding path", () => {
    const { onBindStateGroup } = renderInspector({ story: homeReady })

    fireEvent.change(screen.getByLabelText("Data for Home"), {
      target: { value: "Empty" },
    })
    fireEvent.change(screen.getByLabelText("Foreground for Home"), {
      target: { value: "Running" },
    })

    expect(onBindStateGroup).toHaveBeenCalledWith(
      "object-1",
      "variant",
      "Empty",
    )
    expect(onBindStateGroup).toHaveBeenCalledWith(
      "object-1",
      "foreground",
      "Running",
    )
  })

  it("omits state-group controls for a stateless atom", () => {
    renderInspector({ story: pill })

    expect(screen.getByLabelText("Data source for Pill")).toBeTruthy()
    expect(screen.queryByLabelText("State for Pill")).toBeNull()
    expect(screen.queryByLabelText("Data for Pill")).toBeNull()
    expect(screen.queryByLabelText("Foreground for Pill")).toBeNull()
  })

  it("falls back to declared defaults for sparse object values", () => {
    renderInspector({
      story: homeReady,
      object: instance("home-ready", { variant: "Missing" }),
    })

    expect(screen.getByLabelText("Data for Home")).toHaveProperty(
      "value",
      "Ready",
    )
    expect(screen.getByLabelText("Foreground for Home")).toHaveProperty(
      "value",
      "Ready",
    )
  })
})
