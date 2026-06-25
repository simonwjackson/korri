import { afterEach, describe, expect, it } from "bun:test"
import { composeEntryKey } from "@platform/library/entry-key"
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

  it("moves focus to a visible tile when a live fold removes the focused tile", async () => {
    const local = {
      ...games[0],
      id: "folded-game",
      metadata: { name: "Local Fold Survivor" },
      source: {
        hostId: "self",
        controlUrl: "http://self:3001",
        isLocal: true,
      },
    }
    const remote = {
      ...games[0],
      id: "remote-copy",
      metadata: { name: "Remote Copy" },
      source: {
        hostId: "aka",
        controlUrl: "http://aka:3001",
        isLocal: false,
      },
    }

    const view = render(
      <ShiftHomeRoot items={[local, remote]}>
        <FocusProbe focusTarget={remote} />
      </ShiftHomeRoot>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Focus target" }))
    expect(screen.getByTestId("focused-title").textContent).toBe("Remote Copy")

    view.rerender(
      <ShiftHomeRoot items={[local]}>
        <FocusProbe focusTarget={remote} />
      </ShiftHomeRoot>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("focused-title").textContent).toBe(
        "Local Fold Survivor",
      )
    })
  })

  it("clamps ui scale updates and writes both intrinsic multipliers on the surface", async () => {
    render(
      <ShiftHomeRoot items={games}>
        <ScaleProbe />
      </ShiftHomeRoot>,
    )

    expect(screen.getByText("1")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Scale up" }))

    expect(screen.getByText("1.15")).toBeTruthy()
    await waitFor(() => {
      const host = document.querySelector<HTMLElement>("[data-shift-home]")
      expect(host?.style.getPropertyValue("--intrinsic-text-scale")).toBe(
        "1.15",
      )
      expect(host?.style.getPropertyValue("--intrinsic-pad-scale")).toBe("1.15")
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

function FocusProbe({
  focusTarget,
}: {
  readonly focusTarget: (typeof games)[number] & {
    readonly source?: {
      readonly hostId: string
      readonly controlUrl: string
      readonly isLocal: boolean
    }
  }
}) {
  const { focused, focusTile } = useShiftHome()

  return (
    <div>
      <span data-testid="focused-title">{focused.metadata?.name}</span>
      <button
        type="button"
        onClick={() => focusTile(composeEntryKey(focusTarget))}
      >
        Focus target
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
