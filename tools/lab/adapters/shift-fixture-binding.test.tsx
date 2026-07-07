import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider } from "@effect/atom-react"
import { ShiftHomeRoute } from "@product/surfaces/web/shift/routes/ShiftHomeRoute"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { makeSeedInitialValuesForBinding } from "../seed/shift-seed"

/**
 * Proves the Sources panel's job: picking a fixture source seeds the surface's
 * real catalog edge with that library, and the real ShiftHomeRoute renders it.
 * Clicking a source in the lab sets activeSourceId, which binds these exact
 * initial values onto the remounted surface.
 */
afterEach(cleanup)

describe("shift fixture source binding", () => {
  it("renders the cozy fixture library swapped in at the real edge", async () => {
    const seed = await makeSeedInitialValuesForBinding({
      sourceId: "cozy",
      stateId: "ready",
    })
    render(
      <RegistryProvider initialValues={seed}>
        <ShiftHomeRoute />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
  })

  it("renders the retro fixture library when that source is bound", async () => {
    const seed = await makeSeedInitialValuesForBinding({
      sourceId: "retro",
      stateId: "ready",
    })
    render(
      <RegistryProvider initialValues={seed}>
        <ShiftHomeRoute />
      </RegistryProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText("Pixel Quest")).toBeTruthy()
    })
  })
})
