import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import {
  makeFailingRemoteCatalogSourceLayer,
  makeInMemoryRemoteCatalogSourceLayer,
} from "@platform/acquisition/remote-catalog-source"
import type { ProviderClaim } from "@platform/protocol/acquisition/claim"
import { remoteCatalogSourceLayerAtom } from "@platform/react/acquisition/remote-catalog-atoms"
import { createMemoryHistory } from "@tanstack/history"
import { RouterProvider } from "@tanstack/react-router"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { Layer } from "effect"
import { useLayoutEffect, useMemo } from "react"
import { createShiftRouter } from "./route-tree"

afterEach(() => cleanup())

const claim = (
  providerId: string,
  id: string,
  title: string,
): ProviderClaim => ({
  _tag: "ProviderClaim",
  providerId,
  id,
  title,
  url: `https://example.com/${id}`,
  playable: {
    id,
    releases: [{ id: `${id}-release`, system: "linux" }],
  },
})

const CLAIMS: readonly ProviderClaim[] = [
  claim("@korri:itchio", "celeste", "Celeste Classic"),
  claim("@korri:smwcentral", "celeste-hack", "Celeste World"),
  claim("@korri:itchio", "pico-park", "Pico Park"),
]

/** Mount the REAL router at `entry` with a seeded remote-catalog layer. */
function StoreAt({
  entry,
  layer,
}: {
  readonly entry: string
  readonly layer: Layer.Layer<never>
}) {
  const setSource = useAtomSet(remoteCatalogSourceLayerAtom)
  useLayoutEffect(() => {
    setSource(layer)
  }, [setSource, layer])
  const router = useMemo(
    () =>
      createShiftRouter({
        history: createMemoryHistory({ initialEntries: [entry] }),
      }),
    [entry],
  )
  return <RouterProvider router={router} />
}

describe("Shift store route — remote catalog search", () => {
  it("prompts for a search when the query is empty", async () => {
    render(
      <RegistryProvider>
        <StoreAt
          entry="/store"
          layer={makeInMemoryRemoteCatalogSourceLayer(CLAIMS)}
        />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByText("Type to search the remote catalogs."),
      ).toBeDefined()
    })
  })

  it("cold-loads results for /store?q=… across providers", async () => {
    render(
      <RegistryProvider>
        <StoreAt
          entry="/store?q=celeste"
          layer={makeInMemoryRemoteCatalogSourceLayer(CLAIMS)}
        />
      </RegistryProvider>,
    )

    // Both plugins' claims render; the unrelated one does not.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Celeste Classic" }),
      ).toBeDefined()
    })
    expect(screen.getByRole("button", { name: "Celeste World" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Pico Park" })).toBeNull()
  })

  it("searches live from the finder, debounced into the URL", async () => {
    render(
      <RegistryProvider>
        <StoreAt
          entry="/store"
          layer={makeInMemoryRemoteCatalogSourceLayer(CLAIMS)}
        />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Search the store" }),
      ).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Search the store" }))
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the store" }), {
      target: { value: "pico" },
    })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pico Park" })).toBeDefined()
    })
    expect(screen.queryByRole("button", { name: "Celeste Classic" })).toBeNull()
  })

  it("shows the search error with a retry affordance", async () => {
    render(
      <RegistryProvider>
        <StoreAt
          entry="/store?q=celeste"
          layer={makeFailingRemoteCatalogSourceLayer("catalogs unreachable")}
        />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("catalogs unreachable")).toBeDefined()
    })
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined()
  })

  it("reports nothing found for a query no plugin matches", async () => {
    render(
      <RegistryProvider>
        <StoreAt
          entry="/store?q=zzzz"
          layer={makeInMemoryRemoteCatalogSourceLayer(CLAIMS)}
        />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByText("Nothing found. Try another search."),
      ).toBeDefined()
    })
  })
})
