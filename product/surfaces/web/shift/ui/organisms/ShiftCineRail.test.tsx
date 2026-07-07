import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { createRef } from "react"
import {
  groupRailGames,
  ShiftCineRail,
  type ShiftCineRailGame,
} from "./ShiftCineRail"

afterEach(cleanup)

const noop = () => undefined

function renderRail(games: readonly ShiftCineRailGame[]) {
  return render(
    <ShiftCineRail
      games={games}
      index={0}
      trackX={0}
      trackRef={createRef<HTMLDivElement>()}
      onTileFocus={noop}
      onTileActivate={noop}
    />,
  )
}

describe("groupRailGames", () => {
  it("coalesces consecutive same-section games and preserves absolute index", () => {
    const groups = groupRailGames([
      { id: "a", title: "A", tileArtUrl: "a.png", section: "Continue" },
      { id: "b", title: "B", tileArtUrl: "b.png", section: "Continue" },
      { id: "c", title: "C", tileArtUrl: "c.png", section: "Fresh picks" },
    ])
    expect(groups.map(group => group.label)).toEqual([
      "Continue",
      "Fresh picks",
    ])
    expect(groups[0]?.tiles.map(tile => tile.index)).toEqual([0, 1])
    expect(groups[1]?.tiles.map(tile => tile.index)).toEqual([2])
  })

  it("produces a single unlabeled group when no game carries a section", () => {
    const groups = groupRailGames([
      { id: "a", title: "A", tileArtUrl: "a.png" },
      { id: "b", title: "B", tileArtUrl: "b.png" },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBeUndefined()
  })
})

describe("ShiftCineRail", () => {
  it("renders section captions when games are sectioned", () => {
    renderRail([
      { id: "a", title: "A", tileArtUrl: "a.png", section: "Continue" },
      { id: "b", title: "B", tileArtUrl: "b.png", section: "Fresh picks" },
    ])
    expect(screen.getByText("Continue")).toBeTruthy()
    expect(screen.getByText("Fresh picks")).toBeTruthy()
  })

  it("renders flat without captions when no game is sectioned", () => {
    const { container } = renderRail([
      { id: "a", title: "A", tileArtUrl: "a.png" },
    ])
    expect(container.querySelector(".shift-cine-rail-group")).toBeNull()
    expect(screen.getByRole("button", { name: "A" })).toBeTruthy()
  })
})
