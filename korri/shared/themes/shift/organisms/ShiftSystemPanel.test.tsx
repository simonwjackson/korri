import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  type SpatialNavigationHandle,
  startSpatialNavigation,
} from "@shared/navigation/start"
import { useInputAction } from "@shared/navigation/use-input-action"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { useShiftHome } from "../templates/ShiftHome.context"
import { ShiftHomeRoot } from "../templates/ShiftHomeRoot"
import { ShiftSystemPanel } from "./ShiftSystemPanel"

const games = [{ id: "resume", metadata: { name: "Resume" } }]

let handle: SpatialNavigationHandle

beforeEach(() => {
  handle = startSpatialNavigation({ keyboard: false, gamepad: false })
})

afterEach(() => {
  handle.dispose()
  cleanup()
})

describe("ShiftSystemPanel", () => {
  it("opens from semantic system input and renders an accessible dialog", async () => {
    renderSystemHarness()

    act(() => {
      handle.bus.emit({ type: "system", source: "native" })
    })

    const dialog = await screen.findByRole("dialog", { name: "System" })
    expect(dialog).toBeTruthy()
    expect(
      screen.getByText("Device controls for the active session."),
    ).toBeTruthy()
  })

  it("closes on semantic back only while open", async () => {
    renderSystemHarness()

    act(() => {
      handle.bus.emit({ type: "back" })
    })
    expect(screen.queryByRole("dialog", { name: "System" })).toBeNull()

    act(() => {
      handle.bus.emit({ type: "system", source: "native" })
    })
    await screen.findByRole("dialog", { name: "System" })

    act(() => {
      handle.bus.emit({ type: "back" })
    })

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "System" })).toBeNull()
    })
  })

  it("closes from the explicit close button and restores focus", async () => {
    renderSystemHarness()
    screen.getByRole("button", { name: "Focus target" }).focus()

    act(() => {
      handle.bus.emit({ type: "system", source: "native" })
    })
    await screen.findByRole("dialog", { name: "System" })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "System" })).toBeNull()
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Focus target" }),
      )
    })
  })
})

function renderSystemHarness() {
  return render(
    <ShiftHomeRoot items={games}>
      <OpenSystemOnInput />
      <button type="button">Focus target</button>
      <ShiftSystemPanel />
    </ShiftHomeRoot>,
  )
}

function OpenSystemOnInput() {
  const { openSystemPanel } = useShiftHome()
  useInputAction("system", openSystemPanel)
  return null
}
