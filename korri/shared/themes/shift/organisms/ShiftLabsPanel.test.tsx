import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  type SpatialNavigationHandle,
  startSpatialNavigation,
} from "@shared/navigation/start"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { ShiftUiScaleControl } from "../molecules/ShiftUiScaleControl"
import { useShiftHome } from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"
import { ShiftLabsPanel } from "./ShiftLabsPanel"

const games = [{ id: "resume", metadata: { name: "Resume" } }]

let handle: SpatialNavigationHandle

beforeEach(() => {
  handle = startSpatialNavigation({ keyboard: false, gamepad: false })
})

afterEach(() => {
  handle.dispose()
  cleanup()
  document.documentElement.style.removeProperty("--ui-scale")
})

describe("ShiftLabsPanel", () => {
  it("opens from home context and renders an accessible dialog", async () => {
    renderLabsHarness()

    await clickButton("Open Labs")

    const dialog = await screen.findByRole("dialog", { name: "Labs" })
    expect(dialog).toBeTruthy()
    expect(
      screen.getByText("Experimental controls for tuning this kiosk surface."),
    ).toBeTruthy()
  })

  it("closes from the explicit close button and returns focus", async () => {
    renderLabsHarness()

    await clickButton("Open Labs")
    await screen.findByRole("dialog", { name: "Labs" })

    await clickButton("Close")

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Labs" })).toBeNull()
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Open Labs" }),
      )
    })
  })

  it("closes on semantic back only while open", async () => {
    renderLabsHarness()

    act(() => {
      handle.bus.emit({ type: "back" })
    })
    expect(screen.queryByRole("dialog", { name: "Labs" })).toBeNull()

    await clickButton("Open Labs")
    await screen.findByRole("dialog", { name: "Labs" })

    act(() => {
      handle.bus.emit({ type: "back" })
    })

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Labs" })).toBeNull()
    })
  })

  it("updates the root ui-scale variable from the composed slider", async () => {
    renderLabsHarness()

    await clickButton("Open Labs")
    await screen.findByRole("dialog", { name: "Labs" })

    fireEvent.change(screen.getByRole("slider", { name: "UI scale" }), {
      target: { value: "1.15" },
    })

    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue("--ui-scale"),
      ).toBe("1.15")
    })
  })
})

async function clickButton(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

function renderLabsHarness() {
  return render(
    <ShiftHomeRoot items={games}>
      <OpenLabsButton />
      <ConnectedLabsPanel />
    </ShiftHomeRoot>,
  )
}

function OpenLabsButton() {
  const { openLabs } = useShiftHome()
  return (
    <button type="button" onClick={openLabs} data-shift-labs-trigger="">
      Open Labs
    </button>
  )
}

function ConnectedLabsPanel() {
  const { uiScale, changeUiScale, resetUiScale } = useShiftHome()
  return (
    <ShiftLabsPanel>
      <ShiftUiScaleControl
        value={uiScale}
        onChange={changeUiScale}
        onReset={resetUiScale}
      />
    </ShiftLabsPanel>
  )
}
