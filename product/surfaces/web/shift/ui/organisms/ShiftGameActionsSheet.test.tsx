import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftGameActionsSheet } from "./ShiftGameActionsSheet"
import type {
  ShiftGameActionsHandlers,
  ShiftGameActionsState,
} from "./shift-game-actions-model"

afterEach(() => cleanup())

const state: ShiftGameActionsState = {
  favorite: false,
  played: true,
  running: false,
  releaseCount: 2,
  hasProviderLink: true,
  local: true,
}

function renderSheet(
  handlers: ShiftGameActionsHandlers,
  overrides: Partial<ShiftGameActionsState> = {},
  open = true,
) {
  return render(
    <ShiftGameActionsSheet
      open={open}
      gameTitle="Hollow Knight"
      state={{ ...state, ...overrides }}
      handlers={handlers}
      onClose={() => {}}
    />,
  )
}

describe("ShiftGameActionsSheet", () => {
  it("labels the dialog and titles it with the game", () => {
    renderSheet({})
    expect(
      screen.getByRole("dialog", { name: "Actions for Hollow Knight" }),
    ).toBeDefined()
    expect(screen.getByText("Hollow Knight")).toBeDefined()
  })

  it("shows every grouped section", () => {
    renderSheet({})
    for (const section of [
      "Play",
      "Organize",
      "Content",
      "Settings",
      "Danger",
    ]) {
      expect(screen.getByText(section)).toBeDefined()
    }
  })

  it("renders wired actions active and invokes their handler", () => {
    const onPlay = mock(() => {})
    renderSheet({ onPlay })
    const play = screen.getByRole("button", { name: "Continue" })
    expect((play as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(play)
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it("renders unwired actions present but disabled", () => {
    renderSheet({ onPlay: () => {} })
    const settings = screen.getByRole("button", {
      name: "Game settings",
    }) as HTMLButtonElement
    expect(settings.disabled).toBe(true)
  })

  it("disables an inapplicable action even when wired", () => {
    const onStop = () => {}
    renderSheet({ onStop }, { running: false })
    expect(
      (screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it("marks Remove as destructive", () => {
    renderSheet({})
    expect(
      screen
        .getByRole("button", { name: "Remove from library" })
        .getAttribute("data-tone"),
    ).toBe("danger")
  })

  it("renders nothing while closed", () => {
    renderSheet({}, {}, false)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
