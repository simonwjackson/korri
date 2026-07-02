import { describe, expect, it } from "bun:test"
import type { Story } from "../../types"
import { shiftLabSurfaceAdapter } from "../adapters/shift"
import type { LabSurfaceAdapter } from "../surface-registry"
import {
  LAB_VARIANT_INPUT_ROLE,
  objectInputsForStory,
  resolveObjectInputValues,
} from "./lab-object-inputs"

const pill: Story = {
  id: "pill",
  layer: "atom",
  name: "Pill",
  render: () => "pill",
}

const battery: Story = {
  id: "battery",
  layer: "atom",
  name: "Battery",
  render: () => "battery",
}

const statusBar: Story = {
  id: "status-bar",
  layer: "molecule",
  name: "Status Bar",
  render: () => "status bar",
}

const homeReady: Story = {
  id: "home-ready",
  layer: "page",
  name: "Home · Ready",
  note: "Data states",
  surface: true,
  state: "Ready",
  variants: ["home-empty", "home-loaderror"],
  render: () => "ready",
}

const homeEmpty: Story = {
  id: "home-empty",
  layer: "page",
  name: "Home · Empty",
  note: "Data states",
  surface: true,
  state: "Empty",
  variants: ["home-ready", "home-loaderror"],
  render: () => "empty",
}

const homeLoadError: Story = {
  id: "home-loaderror",
  layer: "page",
  name: "Home · Load error",
  note: "Data states",
  surface: true,
  state: "LoadError",
  variants: ["home-ready", "home-empty"],
  render: () => "error",
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

const pageWithoutVariants: Story = {
  id: "guide",
  layer: "page",
  name: "Guide",
  surface: true,
  render: () => "guide",
}

const byId = new Map(
  [
    pill,
    battery,
    statusBar,
    homeReady,
    homeEmpty,
    homeLoadError,
    detailContinue,
    detailPlay,
    pageWithoutVariants,
  ].map(story => [story.id, story] as const),
)

const adapter = {
  surfacePartInputs: (story: Story) =>
    story.name === "Home" || story.name.startsWith("Home ·")
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
} as Pick<LabSurfaceAdapter, "surfacePartInputs">

describe("objectInputsForStory", () => {
  it("returns no inputs for a stateless atom", () => {
    expect(objectInputsForStory(pill, byId, adapter)).toEqual([])
  })

  it("wraps a variant family as a render-selecting input", () => {
    expect(objectInputsForStory(detailContinue, byId, adapter)).toEqual([
      {
        id: "variant",
        label: "Action",
        role: LAB_VARIANT_INPUT_ROLE,
        defaultValue: "Continue",
        control: {
          kind: "select",
          options: [
            { id: "Continue", label: "Continue" },
            { id: "Play", label: "Play" },
          ],
        },
      },
    ])
  })

  it("combines Shift Home Data and Foreground as peer inputs", () => {
    expect(objectInputsForStory(homeReady, byId, adapter)).toEqual([
      {
        id: "variant",
        label: "Data",
        role: LAB_VARIANT_INPUT_ROLE,
        defaultValue: "Ready",
        control: {
          kind: "select",
          options: [
            { id: "Ready", label: "Ready" },
            { id: "Empty", label: "Empty" },
            { id: "LoadError", label: "Load error" },
          ],
        },
      },
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
    ])
  })

  it("does not give Game Detail the Home-only Foreground input", () => {
    expect(objectInputsForStory(detailContinue, byId, adapter)).toEqual([
      expect.objectContaining({ id: "variant" }),
    ])
  })

  it("uses the real Shift adapter to expose Foreground only on Home", () => {
    expect(
      objectInputsForStory(homeReady, byId, shiftLabSurfaceAdapter).map(
        input => [input.label, input.id],
      ),
    ).toEqual([
      ["Data", "variant"],
      ["Foreground", "foreground"],
      ["Clock", "clock"],
    ])
    expect(
      objectInputsForStory(detailContinue, byId, shiftLabSurfaceAdapter).map(
        input => [input.label, input.id],
      ),
    ).toEqual([["Action", "variant"]])
  })

  it("uses the real Shift adapter to expose matching real inputs on parts", () => {
    // Battery and network are device FACTS delivered as events
    // (surfacePartEvents), not held inputs — the Battery atom keeps no held
    // input at all, and the Status Bar holds only the ambient clock.
    expect(
      objectInputsForStory(battery, byId, shiftLabSurfaceAdapter).map(input => [
        input.label,
        input.id,
      ]),
    ).toEqual([])
    expect(
      objectInputsForStory(statusBar, byId, shiftLabSurfaceAdapter).map(
        input => [input.label, input.id],
      ),
    ).toEqual([["Clock", "clock"]])
  })

  it("can return adapter-owned inputs for a stateless page", () => {
    const pageAdapter = {
      surfacePartInputs: (story: Story) =>
        story.layer === "page"
          ? [
              {
                id: "foreground",
                label: "Foreground",
                defaultValue: "Ready",
                control: {
                  kind: "select",
                  options: [{ id: "Ready", label: "Ready" }],
                },
              },
            ]
          : [],
    } as Pick<LabSurfaceAdapter, "surfacePartInputs">

    expect(
      objectInputsForStory(pageWithoutVariants, byId, pageAdapter),
    ).toEqual([
      {
        id: "foreground",
        label: "Foreground",
        defaultValue: "Ready",
        control: {
          kind: "select",
          options: [{ id: "Ready", label: "Ready" }],
        },
      },
    ])
  })

  it("rejects duplicate input ids", () => {
    const duplicate = {
      surfacePartInputs: () => [
        {
          id: "variant",
          label: "Data duplicate",
          defaultValue: "Ready",
          control: {
            kind: "select",
            options: [{ id: "Ready", label: "Ready" }],
          },
        },
      ],
    } as Pick<LabSurfaceAdapter, "surfacePartInputs">

    expect(() => objectInputsForStory(homeReady, byId, duplicate)).toThrow(
      "Duplicate object input id variant",
    )
  })
})

describe("resolveObjectInputValues", () => {
  it("fills missing and invalid values from input defaults", () => {
    const inputs = objectInputsForStory(homeReady, byId, adapter)

    expect(
      resolveObjectInputValues(inputs, {
        variant: "Nope",
        foreground: "Running",
      }),
    ).toEqual({ variant: "Ready", foreground: "Running" })
    expect(resolveObjectInputValues(inputs, {})).toEqual({
      variant: "Ready",
      foreground: "Ready",
    })
  })

  it("preserves arbitrary valid ISO values for date-time controls", () => {
    expect(
      resolveObjectInputValues(
        [
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
        { clock: "2026-07-01T01:02:00.000Z" },
      ),
    ).toEqual({ clock: "2026-07-01T01:02:00.000Z" })
  })

  it("normalizes case-insensitive stored values to their canonical ids", () => {
    const inputs = objectInputsForStory(homeReady, byId, adapter)

    expect(
      resolveObjectInputValues(inputs, {
        variant: "empty",
        foreground: "running",
      }),
    ).toEqual({ variant: "Empty", foreground: "Running" })
  })
})
