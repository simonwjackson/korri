import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider } from "@effect/atom-react"
import { useDualScreenSession } from "@platform/react/display/dual-screen/DualScreenSession.context"
import { DualScreenSessionRoot } from "@platform/react/display/dual-screen/DualScreenSessionRoot"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { shiftCatalogStateSamples } from "../shift-catalog-state-samples"
import { ShiftHomeStateView } from "./ShiftHomeRoute"

function SelectedGameProbe() {
  const { selectedGameId } = useDualScreenSession()
  return <output aria-label="selected game">{selectedGameId ?? "none"}</output>
}

afterEach(() => cleanup())

describe("ShiftHomeStateView dual-screen focus publication", () => {
  it("publishes the real home focused game into the shared session", async () => {
    render(
      <RegistryProvider>
        <DualScreenSessionRoot>
          <SelectedGameProbe />
          <ShiftHomeStateView result={shiftCatalogStateSamples.Ready()} />
        </DualScreenSessionRoot>
      </RegistryProvider>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText("selected game").textContent).toBe(
        "hollow-knight",
      )
    })

    fireEvent.focus(screen.getByRole("button", { name: "Celeste" }))

    await waitFor(() => {
      expect(screen.getByLabelText("selected game").textContent).toBe("celeste")
    })
  })
})
