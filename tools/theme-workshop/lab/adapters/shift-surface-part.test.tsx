import { afterEach, describe, expect, it } from "bun:test"
import {
  getShiftLiveLaunch,
  setShiftLiveLaunch,
} from "@product/surfaces/web/shift/shift-live-coordinate"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { Story } from "../../types"
import { renderShiftSurfacePart } from "./shift-surface-part"

/**
 * Proves the Workshop's per-object source/state dropdowns swap real data: a
 * placed Shift Home part renders the chosen fixture library and data state
 * through the real catalog edge, not a baked snapshot.
 */
const homeStory: Story = {
  id: "shift-home",
  layer: "page",
  name: "Home",
  surface: true,
  render: () => null,
}

const gameDetailStory: Story = {
  id: "shift-game-detail-continue",
  layer: "page",
  name: "Game Detail",
  surface: true,
  state: "Continue",
  render: () => <div>Game Detail selected page</div>,
}

const batteryStory: Story = {
  id: "shift-atom-shiftbattery-battery",
  layer: "atom",
  name: "Battery",
  render: () => <div>Pre-baked battery snapshot</div>,
}

const statusBarStory: Story = {
  id: "shift-molecule-shiftstatusbar-status-bar",
  layer: "molecule",
  name: "Status Bar",
  render: () => <div>Pre-baked status bar snapshot</div>,
}

afterEach(cleanup)

describe("renderShiftSurfacePart (Workshop edge render)", () => {
  it("renders the dev library at Ready", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "dev",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.queryByText("No games found.")).toBeNull()
    })
  })

  it("renders the cozy library swapped in at the edge", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
  })

  it("renders the retro library swapped in at the edge", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "retro",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Pixel Quest")).toBeTruthy()
    })
  })

  it("honors the chosen data state (Empty) through the edge", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Empty" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("No games found.")).toBeTruthy()
    })
  })

  it("produces launch feedback by pressing Play in a render-only Compose object", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )

    const firstGame = await screen.findByRole("button", {
      name: /Aurora Drift/i,
    })
    fireEvent.click(firstGame)

    await waitFor(() => {
      expect(screen.getByText("Now playing")).toBeTruthy()
    })
  })

  it("does not publish the launch coordinate from a render-only Compose object", async () => {
    // A board object renders the real composition but supplies no coordinate
    // owner, so it must not race the capture singleton another surface owns.
    setShiftLiveLaunch("Launching")
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
    expect(getShiftLiveLaunch()).toBe("Launching")
  })

  it("renders a selected non-Home page part instead of always rendering Home", async () => {
    render(
      <div>
        {renderShiftSurfacePart(gameDetailStory, {
          sourceId: "cozy",
          inputValues: { action: "Continue" },
        })}
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText("Game Detail selected page")).toBeTruthy()
    })
    expect(screen.queryByRole("button", { name: /Aurora Drift/i })).toBeNull()
  })

  it("combines Data×Foreground: a busy foreground blocks on the Ready page", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Ready", foreground: "Running" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Another game is running")).toBeTruthy()
    })
  })

  it("feeds Battery power into the real Battery atom instead of using the baked render", () => {
    const { container } = render(
      <div>
        {renderShiftSurfacePart(batteryStory, {
          sourceId: "dev",
          inputValues: { power: { percent: 64, charging: true } },
        })}
      </div>,
    )

    expect(screen.queryByText("Pre-baked battery snapshot")).toBeNull()
    expect(container.querySelector(".lucide-battery-charging")).toBeTruthy()
  })

  it("feeds Status Bar power through its real Battery child", () => {
    const { container } = render(
      <div>
        {renderShiftSurfacePart(statusBarStory, {
          sourceId: "dev",
          inputValues: { power: { percent: 12, charging: false } },
        })}
      </div>,
    )

    expect(screen.queryByText("Pre-baked status bar snapshot")).toBeNull()
    expect(container.querySelector(".lucide-battery-low")).toBeTruthy()
  })

  it("feeds Status Bar clock text through the real Status Bar molecule", () => {
    render(
      <div>
        {renderShiftSurfacePart(statusBarStory, {
          sourceId: "dev",
          inputValues: { clock: "2026-06-30T23:08:00.000Z" },
        })}
      </div>,
    )

    expect(screen.queryByText("Pre-baked status bar snapshot")).toBeNull()
    expect(screen.getByText("11:08 PM")).toBeTruthy()
  })

  it("feeds Status Bar network status through the real Status Bar molecule", () => {
    const { container } = render(
      <div>
        {renderShiftSurfacePart(statusBarStory, {
          sourceId: "dev",
          inputValues: { network: { _tag: "Disconnected" } },
        })}
      </div>,
    )

    expect(screen.queryByText("Pre-baked status bar snapshot")).toBeNull()
    expect(container.querySelector(".lucide-wifi-off")).toBeTruthy()
  })

  it("feeds Home power through the full Home page's real Status Bar", async () => {
    const { container } = render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: {
            variant: "Ready",
            foreground: "Ready",
            power: { percent: 64, charging: true },
          },
        })}
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
    expect(container.querySelector(".lucide-battery-charging")).toBeTruthy()
  })

  it("feeds Home clock text through the full Home page's real Status Bar", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: {
            variant: "Ready",
            foreground: "Ready",
            clock: "2026-06-30T09:41:00.000Z",
          },
        })}
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
    expect(screen.getByText("9:41 AM")).toBeTruthy()
  })

  it("feeds Home network status through the full Home page's real Status Bar", async () => {
    const { container } = render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: {
            variant: "Ready",
            foreground: "Ready",
            network: { _tag: "Disconnected" },
          },
        })}
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
    expect(container.querySelector(".lucide-wifi-off")).toBeTruthy()
  })
})
