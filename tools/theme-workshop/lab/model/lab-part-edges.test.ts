import { describe, expect, it } from "bun:test"
import type { Story } from "../../types"
import { shiftLabSurfaceAdapter } from "../adapters/shift"
import type { LabSurfaceAdapter, LabSurfaceEvent } from "../surface-registry"
import {
  deviceEventsForScreen,
  deviceInputsForScreen,
  emitScopedEvent,
  pagePartStoryForScreen,
  partEventsForStory,
} from "./lab-part-edges"

/**
 * Part-scoped edges: a part exposes the events its real subtree consumes, and
 * a live device INHERITS its edges from the page part its screen composes —
 * the device declares nothing of its own (falls back to the legacy
 * screen-scoped declaration only when no page part resolves).
 */

const homeStory: Story = {
  id: "shift-page-shifthome-home",
  layer: "page",
  name: "Home",
  surface: true,
  state: "Ready",
  render: () => null,
}

const gameDetailStory: Story = {
  id: "shift-page-detail",
  layer: "page",
  name: "Game Detail",
  surface: true,
  render: () => null,
}

const plainAtomStory: Story = {
  id: "shift-atom-pill",
  layer: "atom",
  name: "Pill",
  render: () => null,
}

describe("partEventsForStory", () => {
  it("exposes battery + network on the Home page part", () => {
    const events = partEventsForStory(homeStory, shiftLabSurfaceAdapter)
    expect(events.map(event => event.id)).toEqual(["battery", "network"])
  })

  it("exposes no events for a part whose subtree consumes none", () => {
    expect(
      partEventsForStory(plainAtomStory, shiftLabSurfaceAdapter),
    ).toHaveLength(0)
  })

  it("resolves an unmapped story to an empty edge set without crashing", () => {
    const adapter: LabSurfaceAdapter = {
      id: "bare",
      devices: [],
      makeSeedInitialValues: async () => ({}),
      mountSurface: () => ({ router: {}, dispose: () => undefined }),
    }
    expect(partEventsForStory(homeStory, adapter)).toHaveLength(0)
  })
})

describe("pagePartStoryForScreen", () => {
  it("resolves the screen route to its composed page part", () => {
    const story = pagePartStoryForScreen(shiftLabSurfaceAdapter, "/", [
      plainAtomStory,
      homeStory,
      gameDetailStory,
    ])
    expect(story?.id).toBe(homeStory.id)
  })

  it("returns null when no page part matches the screen", () => {
    expect(
      pagePartStoryForScreen(shiftLabSurfaceAdapter, "/settings", [homeStory]),
    ).toBeNull()
  })
})

describe("deviceEventsForScreen", () => {
  it("inherits the device's events from the composed page part", () => {
    const events = deviceEventsForScreen(shiftLabSurfaceAdapter, "/", [
      homeStory,
    ])
    expect(events.map(event => event.id)).toEqual(["battery", "network"])
  })

  it("matches the part's own declared events exactly (no device extras)", () => {
    const inherited = deviceEventsForScreen(shiftLabSurfaceAdapter, "/", [
      homeStory,
    ])
    const partOwned =
      shiftLabSurfaceAdapter.surfacePartEvents?.(homeStory) ?? []
    expect(inherited.map(event => event.id)).toEqual(
      partOwned.map(event => event.id),
    )
  })

  it("falls back to a legacy screen-scoped declaration for unmigrated surfaces", () => {
    const legacyEvent: LabSurfaceEvent = {
      id: "legacy",
      label: "Legacy",
      payload: { kind: "boolean" },
      defaultPayload: false,
      emit: () => undefined,
    }
    const legacyAdapter: LabSurfaceAdapter = {
      id: "legacy",
      devices: [],
      screens: [{ label: "Home", path: "/" }],
      eventsForScreen: path => (path === "/" ? [legacyEvent] : []),
      makeSeedInitialValues: async () => ({}),
      mountSurface: () => ({ router: {}, dispose: () => undefined }),
    }

    const events = deviceEventsForScreen(legacyAdapter, "/", [plainAtomStory])
    expect(events.map(event => event.id)).toEqual(["legacy"])
  })
})

describe("deviceInputsForScreen", () => {
  it("inherits the page part's inputs minus those an axis already covers", () => {
    const axes = shiftLabSurfaceAdapter.axesForScreen?.("/") ?? []
    expect(axes.some(axis => axis.id === "foreground")).toBe(true)

    const inputs = deviceInputsForScreen(
      shiftLabSurfaceAdapter,
      "/",
      [homeStory],
      axes,
    )
    // Home's held part inputs are Foreground + Clock; the device's Foreground
    // axis is the richer control for the same edge, so only clock remains.
    expect(inputs.map(input => input.id)).toEqual(["clock"])
  })

  it("falls back to a legacy screen-scoped declaration for unmigrated surfaces", () => {
    const legacyAdapter: LabSurfaceAdapter = {
      id: "legacy",
      devices: [],
      screens: [{ label: "Home", path: "/" }],
      inputsForScreen: path =>
        path === "/"
          ? [
              {
                id: "legacy-input",
                label: "Legacy",
                defaultValue: false,
                control: { kind: "boolean" },
              },
            ]
          : [],
      makeSeedInitialValues: async () => ({}),
      mountSurface: () => ({ router: {}, dispose: () => undefined }),
    }

    const inputs = deviceInputsForScreen(legacyAdapter, "/", [], [])
    expect(inputs.map(input => input.id)).toEqual(["legacy-input"])
  })
})

describe("emitScopedEvent", () => {
  it("canonicalizes the payload and dispatches to the scoped emit", () => {
    const emitted: {
      payload: unknown
      scopeId: string | undefined
    }[] = []
    const event: LabSurfaceEvent = {
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
      emit: (payload, context) =>
        emitted.push({ payload, scopeId: context?.scopeId }),
    }

    const handled = emitScopedEvent([event], "object-1", "battery", {
      percent: 40,
    })

    expect(handled).toBe(true)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.scopeId).toBe("object-1")
    expect(emitted[0]?.payload).toEqual({ percent: 40 })
  })

  it("returns false for an unknown event id", () => {
    expect(emitScopedEvent([], "object-1", "missing", null)).toBe(false)
  })
})
