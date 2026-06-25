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
      parsePartPath(
        "/product/surfaces/web/pico/pages/PicoHome.page.part.tsx",
      ),
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
})
