import { describe, expect, it } from "bun:test"
import type { ResolvedGameRecord } from "@shared/fixtures/games/game"
import { render } from "@testing-library/react"
import { ShiftHomeFeatureTile } from "./ShiftHomeFeatureTile"

describe("ShiftHomeFeatureTile", () => {
  it("uses wide resolved media before tile art", () => {
    const game: ResolvedGameRecord = {
      id: "wii/example.rvz",
      system: "fixture",
      contentPath: "/storage/fixtures/wii/example.rvz.rom",
      media: [
        resolvedMedia("tile", "https://assets.example.test/tile.png"),
        resolvedMedia("banner", "https://assets.example.test/banner.png"),
      ],
    }

    const { container } = render(<ShiftHomeFeatureTile game={game} />)
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://assets.example.test/banner.png",
    )
  })
})

type ResolvedMedia = NonNullable<ResolvedGameRecord["media"]>[number]

function resolvedMedia(
  role: ResolvedMedia["role"],
  url: string,
): ResolvedMedia {
  return {
    role,
    type: "image",
    width: 512,
    height: 512,
    assetId:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    url,
  }
}
