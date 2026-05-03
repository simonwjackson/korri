import { describe, expect, it } from "bun:test"
import type { GameRecord } from "@shared/fixtures/games/game"
import { render } from "@testing-library/react"
import { ShiftHomeFeatureTile } from "./ShiftHomeFeatureTile"

describe("ShiftHomeFeatureTile", () => {
  it("uses wide library media before cover art", () => {
    const game: GameRecord = {
      id: "wii/example.rvz",
      metadata: {
        media: [
          { type: "image", uri: "/api/media/games/wii/example/cover-1024.jpg" },
          {
            type: "image",
            uri: "/api/media/games/wii/example/banner-460x215.png",
          },
        ],
      },
    }

    const { container } = render(<ShiftHomeFeatureTile game={game} />)
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/api/media/games/wii/example/banner-460x215.png",
    )
  })
})
