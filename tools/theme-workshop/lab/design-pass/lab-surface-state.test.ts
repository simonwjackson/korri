import { describe, expect, it } from "bun:test"
import { emptyLabSurfaceState, parseLabSurfaceState } from "./lab-surface-state"

describe("lab surface state", () => {
  it("keeps only valid promoted Take descriptors from stored JSON", () => {
    const parsed = parseLabSurfaceState(
      JSON.stringify({
        version: 1,
        promotedGeneratedTakes: [
          {
            id: "generated-take-1-airier-1",
            designPartId: "design-pass.generated.1.airier.1",
            layer: "molecule",
            name: "Airier status bar",
            note: "Generated from Status Bar",
            surface: false,
            baseStoryId: "status-bar",
            basedOnDesignPartId: "shift.status-bar",
            prompt: "make it calmer",
            variant: "airier",
          },
          { id: "broken", layer: "molecule" },
        ],
      }),
    )

    expect(parsed).toEqual({
      version: 1,
      promotedGeneratedTakes: [
        {
          id: "generated-take-1-airier-1",
          designPartId: "design-pass.generated.1.airier.1",
          layer: "molecule",
          name: "Airier status bar",
          note: "Generated from Status Bar",
          baseStoryId: "status-bar",
          basedOnDesignPartId: "shift.status-bar",
          prompt: "make it calmer",
          variant: "airier",
        },
      ],
    })
  })

  it("treats corrupt storage as empty", () => {
    expect(parseLabSurfaceState("not json")).toEqual(emptyLabSurfaceState())
  })
})
