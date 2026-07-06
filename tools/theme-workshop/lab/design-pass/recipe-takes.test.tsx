import { describe, expect, it } from "bun:test"
import { SHIFT_DESIGN_PARTS } from "@product/surfaces/web/shift/shift-design-parts"
import type { Story } from "../../types"
import {
  createRecipeTakeBatch,
  shiftStatusBarPropsFromRecipe,
} from "./generated-takes"

const statusBarStory: Story = {
  id: "status-bar",
  designPartId: SHIFT_DESIGN_PARTS.statusBar.id,
  layer: "molecule",
  name: "Status Bar",
  render: () => "base status bar",
}

describe("recipe Takes", () => {
  it("maps emphasis knobs to concrete status-bar props", () => {
    const props = shiftStatusBarPropsFromRecipe({
      kind: "shift-status-bar-take-v1",
      batteryEmphasis: "high",
      networkEmphasis: "low",
    })
    expect(props.battery).toEqual({ percent: 97, charging: true })
    expect(props.network).toEqual({ _tag: "Disconnected" })
  })

  it("builds a generated Take batch that carries the recipe on each descriptor", () => {
    const batch = createRecipeTakeBatch(
      {
        surfaceId: "shift",
        baseStory: statusBarStory,
        prompt: "make it calmer",
        seed: 3,
      },
      [
        {
          name: "Gallery Calm",
          summary: "Airy and hushed.",
          recipe: {
            kind: "shift-status-bar-take-v1",
            batteryEmphasis: "low",
            networkEmphasis: "low",
          },
        },
      ],
    )

    expect(batch.stories).toHaveLength(1)
    expect(batch.descriptors[0]?.recipe?.batteryEmphasis).toBe("low")
    expect(batch.descriptors[0]?.summary).toBe("Airy and hushed.")
    expect(batch.metaByStoryId[batch.stories[0]?.id ?? ""]).toMatchObject({
      role: "take",
      prompt: "make it calmer",
      basedOnDesignPartId: SHIFT_DESIGN_PARTS.statusBar.id,
    })
  })
})
