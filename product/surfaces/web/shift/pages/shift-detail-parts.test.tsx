import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { ShiftDetailActionsStates } from "./ShiftDetailActions.molecule.part"
import { ShiftDetailHintsStates } from "./ShiftDetailHints.molecule.part"
import { ShiftDetailSplit } from "./ShiftDetailSplit"
import { shiftDetailFixture } from "./shift-detail-fixtures"

afterEach(cleanup)

/**
 * The Detail molecules as catalog parts: each story renders the REAL
 * component from the shared fixture, and the state families mirror the real
 * play-history rule (played -> Continue + New Game + favourited; fresh ->
 * Play, no New Game).
 */
describe("ShiftDetailActions molecule part", () => {
  it("renders Continue, New Game, and the favourited toggle for a played game", () => {
    const continueStory = ShiftDetailActionsStates.find(
      story => story.state === "Continue",
    )
    render(<div>{continueStory?.render()}</div>)

    expect(screen.getByRole("button", { name: "▶ Continue" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "New Game" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "★ Favorited" })).toBeTruthy()
  })

  it("renders Play without New Game for a fresh game", () => {
    const playStory = ShiftDetailActionsStates.find(
      story => story.state === "Play",
    )
    render(<div>{playStory?.render()}</div>)

    expect(screen.getByRole("button", { name: "▶ Play" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "New Game" })).toBeNull()
    expect(screen.getByRole("button", { name: "☆ Favorite" })).toBeTruthy()
  })

  it("declares a molecule state family with linked variants", () => {
    expect(ShiftDetailActionsStates).toHaveLength(2)
    for (const story of ShiftDetailActionsStates) {
      expect(story.layer).toBe("molecule")
      expect(story.designPartId).toBe("shift.detail-actions")
      expect(story.state).toBeTruthy()
    }
  })
})

describe("ShiftDetailHints molecule part", () => {
  it("maps the A glyph to the play-history verb", () => {
    const continueStory = ShiftDetailHintsStates.find(
      story => story.state === "Continue",
    )
    render(<div>{continueStory?.render()}</div>)
    expect(screen.getByText("Continue")).toBeTruthy()
    expect(screen.getByText("Favorite")).toBeTruthy()
    expect(screen.getByText("Back")).toBeTruthy()
  })

  it("shows Play for a fresh game", () => {
    const playStory = ShiftDetailHintsStates.find(
      story => story.state === "Play",
    )
    render(<div>{playStory?.render()}</div>)
    expect(screen.getByText("Play")).toBeTruthy()
  })
})

describe("ShiftDetailSplit regression with shared fixtures", () => {
  it("renders without optional metadata (never played, no playtime)", () => {
    render(<ShiftDetailSplit game={shiftDetailFixture({})} />)
    expect(screen.getByText("Never played")).toBeTruthy()
  })

  it("renders with absent art exactly as production falls back", () => {
    const { container } = render(
      <ShiftDetailSplit game={shiftDetailFixture({ artUrl: "" })} />,
    )
    const art = container.querySelector(".shift-detail-split-art img")
    expect(art).toBeTruthy()
  })
})
