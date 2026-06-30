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

afterEach(cleanup)

describe("renderShiftSurfacePart (Workshop edge render)", () => {
  it("renders the dev library at Ready", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "dev",
          stateGroupValues: { variant: "Ready" },
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
          stateGroupValues: { variant: "Ready" },
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
          stateGroupValues: { variant: "Ready" },
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
          stateGroupValues: { variant: "Empty" },
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
          stateGroupValues: { variant: "Ready" },
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
          stateGroupValues: { variant: "Ready" },
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
          stateGroupValues: { action: "Continue" },
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
          stateGroupValues: { variant: "Ready", foreground: "Running" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Another game is running")).toBeTruthy()
    })
  })
})
