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

const statusBar: Story = {
  id: "status-bar",
  designPartId: "shift.status-bar",
  layer: "molecule",
  name: "Status Bar",
  render: () => "status",
}

const statusBarTake: Story = {
  id: "status-bar-take",
  layer: "molecule",
  name: "Calmer status bar",
  render: () => "take",
}

const byId = new Map(
  [
    homeReady,
    homeEmpty,
    detailContinue,
    detailPlay,
    pill,
    statusBar,
    statusBarTake,
  ].map(story => [story.id, story] as const),
)

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices: [],
  surfacePartInputs: (story: Story) =>
    story.name === "Home"
      ? [
          {
            id: "foreground",
            label: "Foreground",
            defaultValue: "Ready",
            control: {
              kind: "select",
              options: [
                { id: "Ready", label: "Ready" },
                { id: "Running", label: "Running" },
              ],
            },
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

function context(
  adapterOverride: LabSurfaceAdapter = adapter,
): LabContextValue {
  return {
    adapter: adapterOverride,
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
}

function instance(
  storyId: string,
  inputValues: LabObjectInstance["inputValues"],
): LabObjectInstance {
  return {
    kind: "placed-part",
    id: "object-1",
    storyId,
    sourceId: "dev",
    inputValues,
  }
}

function renderInspector({
  story,
  object = instance(story.id, {}),
  onBind = mock(() => undefined),
  onBindInput = mock(() => undefined),
  adapterOverride,
  storyMeta,
  events,
  onEmitEvent,
}: {
  readonly story: Story
  readonly object?: LabObjectInstance
  readonly onBind?: (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId">>,
  ) => void
  readonly onBindInput?: (
    id: string,
    inputId: string,
    value: LabObjectInstance["inputValues"][string],
  ) => void
  readonly adapterOverride?: LabSurfaceAdapter
  readonly storyMeta?: import("../design-pass/design-pass-model").LabDesignPassStoryMeta
  readonly events?: readonly import("../surface-registry").LabSurfaceEvent[]
  readonly onEmitEvent?: (eventId: string, payload: unknown) => void
}) {
  render(
    <LabContext.Provider value={context(adapterOverride)}>
      <LabObjectInspector
        instance={object}
        story={story}
        storyMeta={storyMeta}
        byId={byId}
        sources={[
          { id: "dev", label: "Dev" },
          { id: "cozy", label: "Cozy" },
        ]}
        events={events}
        onBind={onBind}
        onBindInput={onBindInput}
        onEmitEvent={onEmitEvent}
      />
    </LabContext.Provider>,
  )
  return { onBind, onBindInput }
}

describe("LabObjectInspector", () => {
  it("shows Game Detail Action as an input without Home-only Foreground", () => {
    renderInspector({ story: detailContinue })

    expect(screen.getByLabelText("Action for Game Detail")).toBeTruthy()
    expect(screen.queryByLabelText("State for Game Detail")).toBeNull()
    expect(screen.queryByLabelText("Foreground for Game Detail")).toBeNull()
  })

  it("shows Shift Home Data and Foreground as peer inputs", () => {
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

  it("sends every input through the same binding path", () => {
    const { onBindInput } = renderInspector({ story: homeReady })

    fireEvent.change(screen.getByLabelText("Data for Home"), {
      target: { value: "Empty" },
    })
    fireEvent.change(screen.getByLabelText("Foreground for Home"), {
      target: { value: "Running" },
    })

    expect(onBindInput).toHaveBeenCalledWith("object-1", "variant", "Empty")
    expect(onBindInput).toHaveBeenCalledWith(
      "object-1",
      "foreground",
      "Running",
    )
  })

  it("renders part-scoped events with a Send action for a placed part", () => {
    const emitted: { eventId: string; payload: unknown }[] = []
    renderInspector({
      story: homeReady,
      events: [
        {
          id: "battery",
          label: "Battery",
          payload: {
            kind: "object",
            fields: [
              {
                id: "percent",
                label: "Battery",
                defaultValue: 80,
                control: { kind: "range", min: 0, max: 100, step: 1 },
              },
            ],
          },
          defaultPayload: { percent: 80 },
          emit: () => undefined,
        },
      ],
      onEmitEvent: (eventId, payload) => emitted.push({ eventId, payload }),
    })

    fireEvent.click(screen.getByRole("button", { name: "Send Battery event" }))

    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.eventId).toBe("battery")
  })

  it("shows no events section when the part consumes none", () => {
    renderInspector({ story: homeReady })
    expect(screen.queryByText("Events")).toBeNull()
  })

  it("omits input controls for a stateless atom", () => {
    renderInspector({ story: pill })

    expect(screen.getByLabelText("Data source for Pill")).toBeTruthy()
    expect(screen.queryByLabelText("State for Pill")).toBeNull()
    expect(screen.queryByLabelText("Data for Pill")).toBeNull()
    expect(screen.queryByLabelText("Foreground for Pill")).toBeNull()
  })

  it("shows Take context on the selected canvas object", () => {
    renderInspector({
      story: statusBarTake,
      storyMeta: {
        role: "take",
        passId: "status-bar-ideas",
        passName: "Status bar ideas",
        basedOnDesignPartId: "shift.status-bar",
        prompt: "Make this feel calmer and more premium.",
      },
    })

    expect(screen.getByText("Take")).toBeTruthy()
    expect(screen.getByText("Based on Status Bar")).toBeTruthy()
    expect(
      screen.getByText("“Make this feel calmer and more premium.”"),
    ).toBeTruthy()
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

  it("renders ISO date-time inputs with a date-time field", () => {
    const onBindInput = mock(() => undefined)
    renderInspector({
      story: homeReady,
      object: instance("home-ready", {
        clock: "2026-06-30T16:24:00.000Z",
      }),
      onBindInput,
      adapterOverride: {
        ...adapter,
        surfacePartInputs: () => [
          {
            id: "clock",
            label: "Clock",
            defaultValue: "2026-06-30T16:24:00.000Z",
            control: {
              kind: "iso-datetime",
              options: [
                {
                  id: "2026-06-30T16:24:00.000Z",
                  label: "4:24 PM",
                },
              ],
            },
          },
        ],
      },
    })

    const clock = screen.getByLabelText("Clock for Home")
    expect(clock).toHaveProperty("type", "datetime-local")
    expect(clock).toHaveProperty("value", "2026-06-30T16:24")

    fireEvent.change(clock, { target: { value: "2026-07-01T01:02" } })

    expect(onBindInput).toHaveBeenCalledWith(
      "object-1",
      "clock",
      "2026-07-01T01:02:00.000Z",
    )
  })
})
