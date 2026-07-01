import { describe, expect, it } from "bun:test"
import type { Story } from "../../types"
import {
  createCannedTakeBatch,
  storiesFromGeneratedTakeDescriptors,
} from "./generated-takes"

const statusBarStory: Story = {
  id: "status-bar",
  designPartId: "shift.status-bar",
  layer: "molecule",
  name: "Status Bar",
  render: () => "base status bar",
}

describe("generated Takes", () => {
  it("round-trips generated Take descriptors into promoted story candidates", () => {
    const batch = createCannedTakeBatch({
      surfaceId: "shift",
      baseStory: statusBarStory,
      prompt: "make it calmer",
      count: 1,
      seed: 7,
    })

    const hydrated = storiesFromGeneratedTakeDescriptors(
      batch.descriptors,
      new Map([[statusBarStory.id, statusBarStory]]),
      { promoted: true },
    )

    expect(hydrated.stories).toHaveLength(1)
    expect(hydrated.stories[0]?.id).toBe(batch.stories[0]?.id)
    expect(hydrated.stories[0]?.name).toBe("Airier status bar")
    expect(hydrated.metaByStoryId[hydrated.stories[0]?.id ?? ""]).toMatchObject(
      {
        role: "take",
        prompt: "make it calmer",
        promoted: true,
        basedOnDesignPartId: "shift.status-bar",
      },
    )
  })
})
