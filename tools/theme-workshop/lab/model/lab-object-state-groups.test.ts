import { describe, expect, it } from "bun:test"
import type { Story } from "../../types"
import { shiftLabSurfaceAdapter } from "../adapters/shift"
import type { LabSurfaceAdapter } from "../surface-registry"
import {
  LAB_VARIANT_STATE_GROUP_ROLE,
  objectStateGroupsForStory,
  resolveObjectStateGroupValues,
} from "./lab-object-state-groups"

const pill: Story = {
  id: "pill",
  layer: "atom",
  name: "Pill",
  render: () => "pill",
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
    homeReady,
    homeEmpty,
    homeLoadError,
    detailContinue,
    detailPlay,
    pageWithoutVariants,
  ].map(story => [story.id, story] as const),
)

const adapter = {
  surfacePartStateGroups: (story: Story) =>
    story.name === "Home" || story.name.startsWith("Home ·")
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
} as Pick<LabSurfaceAdapter, "surfacePartStateGroups">

describe("objectStateGroupsForStory", () => {
  it("returns no groups for a stateless atom", () => {
    expect(objectStateGroupsForStory(pill, byId, adapter)).toEqual([])
  })

  it("wraps a variant family as a render-selecting state group", () => {
    expect(objectStateGroupsForStory(detailContinue, byId, adapter)).toEqual([
      {
        id: "variant",
        label: "Action",
        role: LAB_VARIANT_STATE_GROUP_ROLE,
        defaultStateId: "Continue",
        states: [
          { id: "Continue", label: "Continue" },
          { id: "Play", label: "Play" },
        ],
      },
    ])
  })

  it("combines Shift Home Data and Foreground as peer groups", () => {
    expect(objectStateGroupsForStory(homeReady, byId, adapter)).toEqual([
      {
        id: "variant",
        label: "Data",
        role: LAB_VARIANT_STATE_GROUP_ROLE,
        defaultStateId: "Ready",
        states: [
          { id: "Ready", label: "Ready" },
          { id: "Empty", label: "Empty" },
          { id: "LoadError", label: "Load error" },
        ],
      },
      {
        id: "foreground",
        label: "Foreground",
        defaultStateId: "Ready",
        states: [
          { id: "Ready", label: "Ready" },
          { id: "Running", label: "Running" },
        ],
      },
    ])
  })

  it("does not give Game Detail the Home-only Foreground group", () => {
    expect(objectStateGroupsForStory(detailContinue, byId, adapter)).toEqual([
      expect.objectContaining({ id: "variant" }),
    ])
  })

  it("uses the real Shift adapter to expose Foreground only on Home", () => {
    expect(
      objectStateGroupsForStory(homeReady, byId, shiftLabSurfaceAdapter).map(
        group => [group.label, group.id],
      ),
    ).toEqual([
      ["Data", "variant"],
      ["Foreground", "foreground"],
    ])
    expect(
      objectStateGroupsForStory(
        detailContinue,
        byId,
        shiftLabSurfaceAdapter,
      ).map(group => [group.label, group.id]),
    ).toEqual([["Action", "variant"]])
  })

  it("can return adapter-owned groups for a stateless page", () => {
    const pageAdapter = {
      surfacePartStateGroups: (story: Story) =>
        story.layer === "page"
          ? [
              {
                id: "foreground",
                label: "Foreground",
                states: [{ id: "Ready", label: "Ready" }],
              },
            ]
          : [],
    } as Pick<LabSurfaceAdapter, "surfacePartStateGroups">

    expect(
      objectStateGroupsForStory(pageWithoutVariants, byId, pageAdapter),
    ).toEqual([
      {
        id: "foreground",
        label: "Foreground",
        defaultStateId: "Ready",
        states: [{ id: "Ready", label: "Ready" }],
      },
    ])
  })

  it("rejects duplicate state group ids", () => {
    const duplicate = {
      surfacePartStateGroups: () => [
        {
          id: "variant",
          label: "Data duplicate",
          states: [{ id: "Ready", label: "Ready" }],
        },
      ],
    } as Pick<LabSurfaceAdapter, "surfacePartStateGroups">

    expect(() => objectStateGroupsForStory(homeReady, byId, duplicate)).toThrow(
      "Duplicate object state group id variant",
    )
  })
})

describe("resolveObjectStateGroupValues", () => {
  it("fills missing and invalid values from group defaults", () => {
    const groups = objectStateGroupsForStory(homeReady, byId, adapter)

    expect(
      resolveObjectStateGroupValues(groups, {
        variant: "Nope",
        foreground: "Running",
      }),
    ).toEqual({ variant: "Ready", foreground: "Running" })
    expect(resolveObjectStateGroupValues(groups, {})).toEqual({
      variant: "Ready",
      foreground: "Ready",
    })
  })

  it("normalizes case-insensitive stored values to their canonical ids", () => {
    const groups = objectStateGroupsForStory(homeReady, byId, adapter)

    expect(
      resolveObjectStateGroupValues(groups, {
        variant: "empty",
        foreground: "running",
      }),
    ).toEqual({ variant: "Empty", foreground: "Running" })
  })
})
