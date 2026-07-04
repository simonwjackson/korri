import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftStoreGrid } from "./ShiftStoreGrid"
import { ShiftStoreList } from "./ShiftStoreList"
import { ShiftStoreSpotlight } from "./ShiftStoreSpotlight"
import type { ShiftStoreEntry } from "./shift-store-entry"

afterEach(() => cleanup())

const entries: readonly ShiftStoreEntry[] = [
  {
    id: "a",
    title: "Alpha",
    artUrl: "a.png",
    sources: ["itch.io"],
    status: "available",
  },
  {
    id: "b",
    title: "Bravo",
    artUrl: "b.png",
    sources: ["Community"],
    status: "ready",
  },
  {
    id: "c",
    title: "Charlie",
    artUrl: "c.png",
    sources: ["itch.io", "Community", "SMW Central"],
    status: "available",
  },
]

describe("ShiftStoreGrid", () => {
  it("acquires an available entry via its Get button", () => {
    const onGet = mock(() => undefined)
    render(<ShiftStoreGrid entries={entries} onGet={onGet} />)

    fireEvent.click(screen.getByRole("button", { name: "Get Alpha" }))
    expect(onGet).toHaveBeenCalledWith("a")
  })

  it("shows Play for an already-acquired entry", () => {
    render(<ShiftStoreGrid entries={entries} onGet={() => undefined} />)
    expect(screen.getByRole("button", { name: "Play Bravo" })).toBeDefined()
  })

  it("filters the grid as the search text changes", () => {
    render(<ShiftStoreGrid entries={entries} />)

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "alph" },
    })

    expect(screen.getByText("Alpha")).toBeDefined()
    expect(screen.queryByText("Bravo")).toBeNull()
  })

  it("falls back to the empty line when nothing matches", () => {
    render(<ShiftStoreGrid entries={entries} />)

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzzz" },
    })

    expect(screen.getByText(/Nothing found/)).toBeDefined()
  })
})

describe("ShiftStoreSpotlight", () => {
  it("features the top result as a hero heading", () => {
    render(<ShiftStoreSpotlight entries={entries} />)
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeDefined()
  })
})

describe("ShiftStoreList", () => {
  it("renders a Get action per result row", () => {
    const onGet = mock(() => undefined)
    render(<ShiftStoreList entries={entries} onGet={onGet} />)

    fireEvent.click(screen.getByRole("button", { name: "Get Charlie" }))
    expect(onGet).toHaveBeenCalledWith("c")
  })

  it("summarizes a grouped release's provenance in the roomy row", () => {
    render(<ShiftStoreList entries={entries} />)
    // Charlie is mirrored across three sources.
    expect(screen.getByText(/3 sources/)).toBeDefined()
  })
})
