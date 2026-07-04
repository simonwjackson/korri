import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftStoreBrowse } from "./ShiftStoreBrowse"
import { ShiftStoreDrawer } from "./ShiftStoreDrawer"
import { ShiftStoreFinder } from "./ShiftStoreFinder"
import { ShiftStoreIndex } from "./ShiftStoreIndex"
import { ShiftStoreShelves } from "./ShiftStoreShelves"
import { ShiftStoreSpotlight } from "./ShiftStoreSpotlight"
import type { ShiftStoreEntry } from "./shift-store-entry"

afterEach(() => cleanup())

const entries: readonly ShiftStoreEntry[] = [
  {
    id: "a",
    title: "Alpha",
    artUrl: "a.png",
    sources: ["itch.io"],
    genre: "Platformer",
    platform: "Linux",
    developer: "Maddy Makes Games",
    status: "available",
  },
  {
    id: "b",
    title: "Bravo",
    artUrl: "b.png",
    sources: ["Community"],
    genre: "Roguelike",
    platform: "Windows",
    developer: "Supergiant Games",
    status: "ready",
  },
  {
    id: "c",
    title: "Charlie",
    artUrl: "c.png",
    sources: ["Community"],
    genre: "Platformer",
    platform: "Linux",
    developer: "Acid Nerve",
    status: "available",
  },
]

const NO_ACQUIRE = /^(Get|Play|Getting) /

describe("the finder (compact search + filter pill)", () => {
  it("shows no standing search bar and no chips by default", () => {
    render(<ShiftStoreBrowse entries={entries} />)

    // Nothing is open: no input, no chips, no source text leaking onto tiles.
    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /itch\.io/ })).toBeNull()
    expect(screen.queryByText(/itch\.io/)).toBeNull()

    // Just the two compact glyph segments.
    expect(screen.getByRole("button", { name: "Filters" })).toBeDefined()
    expect(
      screen.getByRole("button", { name: "Search the store" }),
    ).toBeDefined()
  })

  it("opens search on demand and filters the results", () => {
    render(<ShiftStoreBrowse entries={entries} />)

    fireEvent.click(screen.getByRole("button", { name: "Search the store" }))
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "brav" },
    })

    expect(screen.getByRole("button", { name: "Bravo" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull()
  })

  it("expands source filters horizontally on demand and narrows results", () => {
    render(<ShiftStoreBrowse entries={entries} />)

    expect(screen.queryByRole("button", { name: /itch\.io/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    fireEvent.click(screen.getByRole("button", { name: /itch\.io/ }))

    expect(screen.getByRole("button", { name: "Alpha" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Bravo" })).toBeNull()
  })

  it("can start with the filter open (fixture seam for the dev-lab)", () => {
    render(
      <ShiftStoreFinder
        defaultFilterOpen
        text=""
        onText={() => undefined}
        facets={[{ value: "itch.io", count: 3 }]}
        selected={[]}
        onToggleSource={() => undefined}
      />,
    )
    expect(screen.getByRole("button", { name: /itch\.io/ })).toBeDefined()
  })

  it("shows search and filter one at a time", () => {
    render(<ShiftStoreBrowse entries={entries} />)

    fireEvent.click(screen.getByRole("button", { name: "Search the store" }))
    expect(screen.getByRole("searchbox")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(screen.getByRole("button", { name: /itch\.io/ })).toBeDefined()
  })
})

describe("store browse variants", () => {
  it("Browse tiles open detail with no acquire chrome", () => {
    const onOpen = mock(() => undefined)
    render(<ShiftStoreBrowse entries={entries} onOpen={onOpen} />)

    expect(screen.queryByRole("button", { name: NO_ACQUIRE })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }))
    expect(onOpen).toHaveBeenCalledWith("a")
  })

  it("Spotlight hero opens detail with no acquire button", () => {
    const onOpen = mock(() => undefined)
    render(<ShiftStoreSpotlight entries={entries} onOpen={onOpen} />)

    expect(screen.queryByRole("button", { name: NO_ACQUIRE })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }))
    expect(onOpen).toHaveBeenCalledWith("a")
  })

  it("Shelves group by source; a query flattens them to a grid", () => {
    render(<ShiftStoreShelves entries={entries} />)

    expect(screen.getByRole("heading", { name: "Community" })).toBeDefined()
    expect(screen.getByRole("heading", { name: "itch.io" })).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Search the store" }))
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "alph" },
    })
    expect(screen.queryByRole("heading", { name: "itch.io" })).toBeNull()
    expect(screen.getByRole("button", { name: "Alpha" })).toBeDefined()
  })

  it("Index lists alphabetically and opens detail on activation", () => {
    const onOpen = mock(() => undefined)
    render(<ShiftStoreIndex entries={entries} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole("button", { name: "Charlie" }))
    expect(onOpen).toHaveBeenCalledWith("c")
  })

  it("Drawer opens the panel with a fit-for-purpose control per group", () => {
    render(<ShiftStoreDrawer entries={entries} />)

    expect(screen.queryByText("Search & filters")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Search and filters" }))

    // The curated refine set — and NO developer facet cloud: the search field
    // covers developers instead.
    expect(screen.getByText("Sort")).toBeDefined()
    expect(screen.getByText("Availability")).toBeDefined()
    expect(screen.getByText("Sources")).toBeDefined()
    expect(screen.getByText("Genres")).toBeDefined()
    expect(screen.getByText("Platforms")).toBeDefined()
    expect(screen.queryByText("Developers")).toBeNull()
    expect(
      screen.getByPlaceholderText("Search titles or developers"),
    ).toBeDefined()
    expect(screen.getByText("3 results")).toBeDefined()

    // Each group wears a different chip candidate.
    const variantOf = (name: RegExp) =>
      screen.getByRole("button", { name }).getAttribute("data-variant")
    expect(variantOf(/Relevance/)).toBe("cursor")
    expect(variantOf(/Not acquired/)).toBe("underline")
    expect(variantOf(/itch\.io/)).toBe("dot")
    expect(variantOf(/Roguelike/)).toBe("type")
    expect(variantOf(/Linux/)).toBe("kicker")

    // Any facet narrows the live grid + tally…
    fireEvent.click(screen.getByRole("button", { name: /Roguelike/ }))
    expect(screen.getByText("1 result")).toBeDefined()
    expect(screen.getByRole("button", { name: "Bravo" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull()

    // …and Clear all restores everything.
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
    expect(screen.getByText("3 results")).toBeDefined()
  })

  it("Drawer's availability lens is pick-one and searches by developer", () => {
    render(<ShiftStoreDrawer entries={entries} />)

    fireEvent.click(screen.getByRole("button", { name: "Search and filters" }))

    // Ready to play → only the acquired entry.
    fireEvent.click(screen.getByRole("button", { name: /Ready to play/ }))
    expect(screen.getByText("1 result")).toBeDefined()
    expect(screen.getByRole("button", { name: "Bravo" })).toBeDefined()

    // Switching the lens replaces it (pick-one), never stacks.
    fireEvent.click(screen.getByRole("button", { name: /Not acquired/ }))
    expect(screen.getByText("2 results")).toBeDefined()

    // Developers filter via the search field, not a facet cloud.
    fireEvent.click(screen.getByRole("button", { name: /^All$/ }))
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "supergiant" },
    })
    expect(screen.getByText("1 result")).toBeDefined()
    expect(screen.getByRole("button", { name: "Bravo" })).toBeDefined()
  })

  it("Index summarizes a grouped release's provenance in the roomy row", () => {
    const grouped: readonly ShiftStoreEntry[] = [
      {
        id: "g",
        title: "Grouped",
        artUrl: "g.png",
        sources: ["itch.io", "Community", "SMW Central"],
        status: "available",
      },
    ]
    render(<ShiftStoreIndex entries={grouped} />)
    expect(screen.getByText(/3 sources/)).toBeDefined()
  })
})

describe("exploration marking (takes)", () => {
  it("stamps each variant root with the data-proto take attribute", () => {
    const cases = [
      {
        node: <ShiftStoreSpotlight entries={entries} />,
        tag: "store-spotlight",
      },
      { node: <ShiftStoreBrowse entries={entries} />, tag: "store-browse" },
      { node: <ShiftStoreShelves entries={entries} />, tag: "store-shelves" },
      { node: <ShiftStoreIndex entries={entries} />, tag: "store-index" },
      { node: <ShiftStoreDrawer entries={entries} />, tag: "store-drawer" },
    ]
    for (const { node, tag } of cases) {
      const { container } = render(node)
      expect(container.querySelector(`[data-proto="${tag}"]`)).not.toBeNull()
      cleanup()
    }
  })
})
