import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { createMemoryHistory } from "@tanstack/history"
import { RouterProvider } from "@tanstack/react-router"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { useLayoutEffect, useMemo } from "react"
import { shiftCatalogSourceLayers } from "../shift-catalog-state-samples"
import { createShiftRouter } from "./route-tree"

afterEach(() => cleanup())

/**
 * R1: the Library's `lens`/`sort` are addressable via typed URL search. Mount
 * the REAL router at a search-bearing entry and assert the view reflects it on
 * cold load — the data edge is the real catalog source, not a preview singleton.
 */
function LibraryAt({ entry }: { readonly entry: string }) {
  const setCatalog = useAtomSet(catalogFactsSourceLayerAtom)
  useLayoutEffect(() => {
    setCatalog(shiftCatalogSourceLayers.Ready())
  }, [setCatalog])
  const router = useMemo(
    () =>
      createShiftRouter({
        history: createMemoryHistory({ initialEntries: [entry] }),
      }),
    [entry],
  )
  return <RouterProvider router={router} />
}

describe("Shift library route — URL-addressable view-state", () => {
  it("cold-loads the Favorites lens from ?lens=favorites", async () => {
    render(
      <RegistryProvider>
        <LibraryAt entry="/library?lens=favorites" />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(
        screen
          .getByRole("tab", { name: "Favorites" })
          .getAttribute("aria-selected"),
      ).toBe("true")
    })
    expect(
      screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected"),
    ).toBe("false")
  })

  it("cold-loads the By Genre lens from ?lens=genre", async () => {
    render(
      <RegistryProvider>
        <LibraryAt entry="/library?lens=genre" />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(
        screen
          .getByRole("tab", { name: "By Genre" })
          .getAttribute("aria-selected"),
      ).toBe("true")
    })
  })

  it("defaults to the All lens when no search is present", async () => {
    render(
      <RegistryProvider>
        <LibraryAt entry="/library" />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected"),
      ).toBe("true")
    })
  })
})
