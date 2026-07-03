import { describe, expect, it } from "bun:test"
import {
  __setPartModulesForTest,
  collectPartsFromModules,
  hasSurfaceParts,
  loadSurfaceParts,
  parsePartPath,
} from "./parts-discovery"

describe("lab parts discovery", () => {
  it("infers surface, layer, and display name from a filename-suffixed part path", () => {
    expect(
      parsePartPath(
        "/product/surfaces/web/shift/chrome/ShiftPill.atom.part.tsx",
      ),
    ).toEqual({ surfaceId: "shift", layer: "atom", baseName: "ShiftPill" })
    expect(
      parsePartPath("/product/surfaces/web/pico/pages/PicoHome.page.part.tsx"),
    ).toEqual({ surfaceId: "pico", layer: "page", baseName: "PicoHome" })
    expect(parsePartPath("./pico/ui/Badge.atom.part.tsx")).toEqual({
      surfaceId: "pico",
      layer: "atom",
      baseName: "Badge",
    })
  })

  it("ignores part files that do not carry an atomic layer suffix", () => {
    expect(
      parsePartPath("/product/surfaces/web/shift/chrome/ShiftPill.part.tsx"),
    ).toBeNull()
  })

  it("normalizes default components, named variants, and StorySpec-compatible defaults", () => {
    const catalog = collectPartsFromModules(
      {
        "/product/surfaces/web/shift/chrome/ShiftPill.atom.part.tsx": {
          default: () => "pill",
          DisabledPart: () => "disabled",
          helper: () => "ignored",
        },
        "/product/surfaces/web/shift/screens/ShiftHome.page.part.tsx": {
          default: {
            name: "Shift Home",
            note: "ready state",
            presentation: "surface",
            render: () => "home",
          },
        },
        "/product/surfaces/web/pico/ui/Badge.atom.part.tsx": {
          default: () => "badge",
        },
      },
      "shift",
    )

    expect(catalog.stories.map(story => story.name)).toEqual([
      "Shift Home",
      "Disabled",
      "Shift Pill",
    ])
    expect(catalog.stories.map(story => story.layer)).toEqual([
      "page",
      "atom",
      "atom",
    ])
    expect(catalog.stories[0]?.surface).toBe(true)
  })

  it("preserves product-owned design part ids from story specs", () => {
    const catalog = collectPartsFromModules(
      {
        "/product/surfaces/web/shift/ui/Status.molecule.part.tsx": {
          default: {
            designPartId: "shift.status-bar",
            name: "Duplicate Label",
            render: () => "status",
          },
        },
        "/product/surfaces/web/shift/ui/Other.molecule.part.tsx": {
          default: {
            designPartId: "shift.other-status",
            name: "Duplicate Label",
            render: () => "other",
          },
        },
      },
      "shift",
    )

    expect(catalog.stories.map(story => story.designPartId).sort()).toEqual([
      "shift.other-status",
      "shift.status-bar",
    ])
  })

  it("reports and loads surface parts from injected modules", async () => {
    __setPartModulesForTest({
      "/product/surfaces/web/pico/ui/Badge.atom.part.tsx": {
        default: () => "badge",
        rootProps: { "data-pico": true },
      },
    })
    try {
      expect(hasSurfaceParts("pico")).toBe(true)
      expect(hasSurfaceParts("shift")).toBe(false)
      const catalog = await loadSurfaceParts("pico")
      expect(catalog.stories).toHaveLength(1)
      expect(catalog.rootProps).toEqual({ "data-pico": true })
    } finally {
      __setPartModulesForTest(null)
    }
  })

  it("relates local array-exported state variants without a central manifest", () => {
    const catalog = collectPartsFromModules(
      {
        "/product/surfaces/web/shift/pages/Home.page.part.tsx": {
          HomeStates: [
            { name: "Home Ready", state: "ready", render: () => "ready" },
            { name: "Home Empty", state: "empty", render: () => "empty" },
          ],
        },
      },
      "shift",
    )

    expect(catalog.stories.map(story => story.state)).toEqual([
      "empty",
      "ready",
    ])
    expect(catalog.stories.every(story => story.variants?.length === 1)).toBe(
      true,
    )
  })

  it("does not relate ordinary named exports as state variants", () => {
    const catalog = collectPartsFromModules(
      {
        "/product/surfaces/web/shift/ui/Buttons.atom.part.tsx": {
          PrimaryButton: () => "primary",
          DangerButton: () => "danger",
        },
      },
      "shift",
    )

    expect(catalog.stories).toHaveLength(2)
    expect(catalog.stories.every(story => story.variants === undefined)).toBe(
      true,
    )
  })

  it("keeps loaded stories when one injected module fails to import", async () => {
    __setPartModulesForTest({
      "/product/surfaces/web/pico/ui/Badge.atom.part.tsx": {
        default: () => "badge",
      },
      "/product/surfaces/web/pico/ui/Broken.atom.part.tsx": async () => {
        throw new Error("boom")
      },
    } as never)
    try {
      const catalog = await loadSurfaceParts("pico")
      expect(catalog.stories).toHaveLength(1)
      expect(catalog.errors).toEqual([
        {
          path: "/product/surfaces/web/pico/ui/Broken.atom.part.tsx",
          message: "boom",
        },
      ])
    } finally {
      __setPartModulesForTest(null)
    }
  })
})
