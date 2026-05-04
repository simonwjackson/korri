import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useDualScreenSession } from "./DualScreenSession.context"
import { DualScreenSessionRoot } from "./DualScreenSessionRoot"

afterEach(() => cleanup())

describe("DualScreenSessionRoot", () => {
  it("shares selected game changes with all consumers", () => {
    render(
      <DualScreenSessionRoot initialGameId="crystalline-drift">
        <SessionProbe />
        <SessionProbe label="second" />
      </DualScreenSessionRoot>,
    )

    expect(screen.getByText("selected: crystalline-drift")).toBeTruthy()
    expect(screen.getByText("second: crystalline-drift")).toBeTruthy()

    fireEvent.click(screen.getAllByRole("button", { name: "Focus Ember" })[0])

    expect(screen.getByText("selected: ember-circuit")).toBeTruthy()
    expect(screen.getByText("second: ember-circuit")).toBeTruthy()
  })

  it("accepts duplicate selected game publications", () => {
    render(
      <DualScreenSessionRoot initialGameId="crystalline-drift">
        <SessionProbe />
      </DualScreenSessionRoot>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Focus Ember" }))
    fireEvent.click(screen.getByRole("button", { name: "Focus Ember" }))

    expect(screen.getByText("selected: ember-circuit")).toBeTruthy()
  })

  it("requires a provider", () => {
    expect(() => render(<SessionProbe />)).toThrow(
      "useDualScreenSession must be used inside a DualScreenSessionRoot",
    )
  })
})

function SessionProbe({ label = "selected" }: { readonly label?: string }) {
  const { selectedGameId, focusGame } = useDualScreenSession()

  return (
    <div>
      <span>
        {label}: {selectedGameId}
      </span>
      <button
        type="button"
        onClick={() => focusGame("ember-circuit", "primary")}
      >
        Focus Ember
      </button>
    </div>
  )
}
