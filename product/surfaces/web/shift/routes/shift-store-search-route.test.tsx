import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomSet } from "@effect/atom-react"
import {
  makeFailingRemoteCatalogSourceLayer,
  makeInMemoryRemoteCatalogSourceLayer,
  type RemoteCatalogSource,
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
import { shiftStoreEntryIdToRouteToken } from "./paths"
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
  history,
}: {
  readonly entry: string
  readonly layer: Layer.Layer<RemoteCatalogSource>
  readonly history?: ReturnType<typeof createMemoryHistory>
}) {
  const setSource = useAtomSet(remoteCatalogSourceLayerAtom)
  useLayoutEffect(() => {
    setSource(layer)
  }, [setSource, layer])
  const router = useMemo(
    () =>
      createShiftRouter({
        history: history ?? createMemoryHistory({ initialEntries: [entry] }),
      }),
    [entry, history],
  )
  return <RouterProvider router={router} />
}

async function typeStoreSearch(value: string) {
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Search the store" }),
    ).toBeDefined()
  })

  fireEvent.click(screen.getByRole("button", { name: "Search the store" }))
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search the store" }),
    {
      target: { value },
    },
  )
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

    await typeStoreSearch("pico")

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pico Park" })).toBeDefined()
    })
    expect(screen.queryByRole("button", { name: "Celeste Classic" })).toBeNull()
  })

  it("searches from typed text even when URL replacement lags", async () => {
    const history = createMemoryHistory({ initialEntries: ["/store"] })
    const replaceCalls: string[] = []
    ;(history as unknown as { replace: (href: string) => void }).replace =
      href => {
        replaceCalls.push(href)
      }

    render(
      <RegistryProvider>
        <StoreAt
          entry="/store"
          layer={makeInMemoryRemoteCatalogSourceLayer(CLAIMS)}
          history={history}
        />
      </RegistryProvider>,
    )

    await typeStoreSearch("pico")

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pico Park" })).toBeDefined()
    })
    expect(history.location.href).toBe("/store")
    expect(replaceCalls.some(href => href.includes("q=pico"))).toBe(true)
  })

  it("opens a searched item detail page from the result tile", async () => {
    render(
      <RegistryProvider>
        <StoreAt
          entry="/store?q=pico"
          layer={makeInMemoryRemoteCatalogSourceLayer(CLAIMS)}
        />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pico Park" })).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Pico Park" }))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Pico Park" })).toBeDefined()
    })
    expect(screen.getByRole("button", { name: "Get" })).toBeDefined()
    expect(screen.getAllByText(/itch\.io/).length).toBeGreaterThan(0)
  })

  it("cold-loads a store detail page from its query and entry token", async () => {
    const entryId = "@korri:itchio:pico-park"
    render(
      <RegistryProvider>
        <StoreAt
          entry={`/store/${shiftStoreEntryIdToRouteToken(entryId)}?q=pico`}
          layer={makeInMemoryRemoteCatalogSourceLayer(CLAIMS)}
        />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Pico Park" })).toBeDefined()
    })
    expect(screen.getByText(/available from itch\.io/)).toBeDefined()
  })

  it("acquires from the detail page Get button", async () => {
    const entryId = "@korri:itchio:pico-park"
    render(
      <RegistryProvider>
        <StoreAt
          entry={`/store/${shiftStoreEntryIdToRouteToken(entryId)}?q=pico`}
          layer={makeInMemoryRemoteCatalogSourceLayer(CLAIMS)}
        />
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Get" })).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Get" }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Downloaded" })).toBeDefined()
    })
    expect(screen.getByText("Downloaded to this device.")).toBeDefined()
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
