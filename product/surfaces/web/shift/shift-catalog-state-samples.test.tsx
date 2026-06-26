import { RegistryProvider } from "@effect/atom-react"
import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { ShiftCatalogState } from "./catalog/shift-catalog-state"
import { ShiftHomeStateView } from "./routes/ShiftHomeRoute"
import { shiftCatalogStateSamples } from "./shift-catalog-state-samples"

afterEach(() => cleanup())

describe("shiftCatalogStateSamples", () => {
  it("provides a sample for every catalog state (exhaustive)", () => {
    expect(Object.keys(shiftCatalogStateSamples).sort()).toEqual(
      [...ShiftCatalogState.tags].sort(),
    )
  })

  it("renders each data state through the real view without crashing", () => {
    for (const tag of ShiftCatalogState.tags) {
      const result = shiftCatalogStateSamples[tag]()
      const { container, unmount } = render(
        <RegistryProvider>
          <ShiftHomeStateView result={result} />
        </RegistryProvider>,
      )
      expect(container.querySelector("[data-shift-home-frame]")).toBeTruthy()
      unmount()
    }
  })

  it("drives the Ready state to the cinematic home with games", () => {
    const { container } = render(
      <RegistryProvider>
        <ShiftHomeStateView result={shiftCatalogStateSamples.Ready()} />
      </RegistryProvider>,
    )
    expect(container.querySelector("[data-shift-home]")).toBeTruthy()
  })
})
