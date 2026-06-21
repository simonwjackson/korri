import { afterEach, describe, expect, it } from "bun:test"
import { UI_SCALE_CSS_VARIABLE } from "@platform/react/primitives/theme/ui-scale"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { useShiftHome } from "./ShiftHome.context"
import { ShiftHomeRoot } from "./ShiftHomeRoot"

const games = [
  {
    id: "resume",
    system: "fixture",
    contentPath: "/storage/fixtures/resume.rom",
    metadata: { name: "Resume" },
  },
]

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty(UI_SCALE_CSS_VARIABLE)
})

describe("ShiftHomeRoot", () => {
  it("owns Labs open and close mutations", () => {
    render(
      <ShiftHomeRoot items={games}>
        <LabsStateProbe />
      </ShiftHomeRoot>,
    )

    expect(screen.getByText("closed")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    expect(screen.getByText("open")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.getByText("closed")).toBeTruthy()
  })

  it("clamps ui scale updates and writes the root CSS variable", async () => {
    render(
      <ShiftHomeRoot items={games}>
        <ScaleProbe />
      </ShiftHomeRoot>,
    )

    expect(screen.getByText("1")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Scale up" }))

    expect(screen.getByText("1.15")).toBeTruthy()
    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue(UI_SCALE_CSS_VARIABLE),
      ).toBe("1.15")
    })

    fireEvent.click(screen.getByRole("button", { name: "Too large" }))
    expect(screen.getByText("1.5")).toBeTruthy()
  })
})

function LabsStateProbe() {
  const { isLabsOpen, openLabs, closeLabs } = useShiftHome()

  return (
    <div>
      <span>{isLabsOpen ? "open" : "closed"}</span>
      <button type="button" onClick={openLabs}>
        Open
      </button>
      <button type="button" onClick={closeLabs}>
        Close
      </button>
    </div>
  )
}

function ScaleProbe() {
  const { uiScale, changeUiScale } = useShiftHome()

  return (
    <div>
      <span>{uiScale}</span>
      <button type="button" onClick={() => changeUiScale(1.15)}>
        Scale up
      </button>
      <button type="button" onClick={() => changeUiScale(9)}>
        Too large
      </button>
    </div>
  )
}
