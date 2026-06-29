import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLibraryShelves } from "./ShiftLibraryShelves"
import type { ShiftLibrarySection } from "./shift-library-sections"

afterEach(() => cleanup())

const sections: readonly ShiftLibrarySection[] = [
  {
    id: "continue",
    title: "Continue Playing",
    games: [{ id: "a", title: "Game A", artUrl: "a.png" }],
  },
  {
    id: "all",
    title: "All Games",
    games: [
      { id: "a", title: "Game A", artUrl: "a.png" },
      { id: "b", title: "Game B", artUrl: "b.png" },
    ],
  },
]

describe("ShiftLibraryShelves", () => {
  it("renders a heading per section", () => {
    render(<ShiftLibraryShelves sections={sections} />)

    expect(
      screen.getByRole("heading", { name: "Continue Playing" }),
    ).toBeDefined()
    expect(screen.getByRole("heading", { name: "All Games" })).toBeDefined()
  })

  it("activates the clicked tile by id", () => {
    const onSelect = mock(() => undefined)
    render(<ShiftLibraryShelves sections={sections} onSelect={onSelect} />)

    // "Game B" only appears in All Games, so the lookup is unambiguous.
    fireEvent.click(screen.getByRole("button", { name: "Game B" }))

    expect(onSelect).toHaveBeenCalledWith("b")
  })

  it("renders an empty message when there are no sections", () => {
    render(<ShiftLibraryShelves sections={[]} />)

    expect(screen.getByText("No games found.")).toBeDefined()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
