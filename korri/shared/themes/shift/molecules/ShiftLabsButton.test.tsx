import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftLabsButton } from "./ShiftLabsButton"

afterEach(() => cleanup())

describe("ShiftLabsButton", () => {
  it("renders a native Labs button and calls onActivate when clicked", () => {
    let activations = 0

    render(<ShiftLabsButton onActivate={() => activations += 1} />)

    const button = screen.getByRole("button", { name: "Labs" })
    expect(button.tagName).toBe("BUTTON")

    fireEvent.click(button)

    expect(activations).toBe(1)
  })
})
