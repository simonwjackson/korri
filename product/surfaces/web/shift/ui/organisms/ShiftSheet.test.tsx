import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftSheetBody } from "./ShiftSheetBody"
import { ShiftSheetHeader } from "./ShiftSheetHeader"
import { ShiftSheetPanel } from "./ShiftSheetPanel"
import { ShiftSheetRoot } from "./ShiftSheetRoot"
import { ShiftSheetTitle } from "./ShiftSheetTitle"

afterEach(() => cleanup())

function renderSheet(open: boolean, onClose = mock(() => {})) {
  const result = render(
    <ShiftSheetRoot open={open} onClose={onClose} label="Filters">
      <ShiftSheetPanel>
        <ShiftSheetHeader>
          <ShiftSheetTitle>Filters</ShiftSheetTitle>
        </ShiftSheetHeader>
        <ShiftSheetBody>
          <p>Body</p>
        </ShiftSheetBody>
      </ShiftSheetPanel>
    </ShiftSheetRoot>,
  )
  return { ...result, onClose }
}

describe("ShiftSheet", () => {
  it("renders nothing while closed", () => {
    renderSheet(false)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("presents a labelled dialog while open", () => {
    renderSheet(true)
    const dialog = screen.getByRole("dialog", { name: "Filters" })
    expect(dialog.getAttribute("data-side")).toBe("right")
    expect(screen.getByText("Body")).toBeDefined()
  })

  it("anchors to the requested side", () => {
    render(
      <ShiftSheetRoot open onClose={() => {}} label="Menu" side="left">
        <ShiftSheetPanel>
          <ShiftSheetBody>x</ShiftSheetBody>
        </ShiftSheetPanel>
      </ShiftSheetRoot>,
    )
    expect(screen.getByRole("dialog").getAttribute("data-side")).toBe("left")
  })

  it("closes from the header control", () => {
    const { onClose } = renderSheet(true)
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("closes on a scrim press but not a press inside the panel", () => {
    const { container, onClose } = renderSheet(true)
    const scrim = container.querySelector(".shift-sheet-scrim")
    if (!scrim) throw new Error("scrim not found")

    fireEvent.pointerDown(screen.getByRole("dialog"))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
