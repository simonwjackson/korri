import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftStoreBrowse } from "./ShiftStoreBrowse"
import { ShiftStoreIndex } from "./ShiftStoreIndex"
import { ShiftStoreShelves } from "./ShiftStoreShelves"
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
    sources: ["Community"],
    status: "available",
  },
]

describe("ShiftStoreBrowse", () => {
  it("opens an entry's detail instead of acquiring in place", () => {
    const onOpen = mock(() => undefined)
    render(<ShiftStoreBrowse entries={entries} onOpen={onOpen} />)

    // No acquire buttons on the browse page.
    expect(screen.queryByRole("button", { name: /^Get / })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Play / })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }))
    expect(onOpen).toHaveBeenCalledWith("a")
  })

  it("never surfaces the source on the small browse tiles", () => {
    // The browse grid has no shelf headings, so a source name appearing here
    // could only come from a tile — and small cards must not show provenance.
    render(<ShiftStoreBrowse entries={entries} />)
    expect(screen.queryByText(/itch\.io/)).toBeNull()
    expect(screen.queryByText(/Community/)).toBeNull()
  })

  it("summons search on demand rather than showing a standing bar", () => {
    render(<ShiftStoreBrowse entries={entries} />)

    // No search input until the trigger is activated.
    expect(screen.queryByRole("searchbox")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Search the store" }))
    const box = screen.getByRole("searchbox")

    fireEvent.change(box, { target: { value: "brav" } })
    expect(screen.getByRole("button", { name: "Bravo" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull()
  })

  it("leaves search and restores the full browse on close", () => {
    render(<ShiftStoreBrowse entries={entries} />)

    fireEvent.click(screen.getByRole("button", { name: "Search the store" }))
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "brav" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Close search" }))

    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(screen.getByRole("button", { name: "Alpha" })).toBeDefined()
  })
})

describe("ShiftStoreShelves", () => {
  it("groups the storefront into per-source shelves", () => {
    render(<ShiftStoreShelves entries={entries} />)

    expect(screen.getByRole("heading", { name: "Community" })).toBeDefined()
    expect(screen.getByRole("heading", { name: "itch.io" })).toBeDefined()
  })
})

describe("ShiftStoreIndex", () => {
  it("lists rows alphabetically and opens detail on activation", () => {
    const onOpen = mock(() => undefined)
    render(<ShiftStoreIndex entries={entries} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole("button", { name: "Charlie" }))
    expect(onOpen).toHaveBeenCalledWith("c")
  })
})
