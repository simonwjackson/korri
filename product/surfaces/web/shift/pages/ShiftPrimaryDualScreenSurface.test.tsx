import { afterEach, describe, expect, it } from "bun:test"
import { games } from "@platform/fixtures/games/games"
import type { LaunchController } from "@platform/library/launch-state"
import { useDualScreenSession } from "@platform/react/display/dual-screen/DualScreenSession.context"
import { DualScreenSessionRoot } from "@platform/react/display/dual-screen/DualScreenSessionRoot"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { ShiftPrimaryDualScreenSurface } from "./ShiftPrimaryDualScreenSurface"

const storyGames = games.slice(0, 2)

afterEach(() => cleanup())

describe("ShiftPrimaryDualScreenSurface", () => {
  it("publishes the initial resume target", async () => {
    render(
      <DualScreenSessionRoot initialGameId="unpublished">
        <ShiftPrimaryDualScreenSurface items={storyGames} launch={launch} />
        <SelectedGameProbe />
      </DualScreenSessionRoot>,
    )

    await waitFor(() => {
      expect(screen.getByText("selected: crystalline-drift")).toBeTruthy()
    })
  })

  it("publishes focused rail tiles", async () => {
    const { container } = render(
      <DualScreenSessionRoot initialGameId="crystalline-drift">
        <ShiftPrimaryDualScreenSurface items={storyGames} launch={launch} />
        <SelectedGameProbe />
      </DualScreenSessionRoot>,
    )

    await waitFor(() => {
      expect(
        container.querySelector<HTMLElement>('[data-tile-id="ember-circuit"]'),
      ).toBeTruthy()
    })

    const ember = container.querySelector<HTMLElement>(
      '[data-tile-id="ember-circuit"]',
    )
    if (!ember) throw new Error("Expected Ember Circuit tile")

    fireEvent.focus(ember)

    await waitFor(() => {
      expect(screen.getByText("selected: ember-circuit")).toBeTruthy()
    })
  })
})

function SelectedGameProbe() {
  const { selectedGameId } = useDualScreenSession()
  return <span>selected: {selectedGameId}</span>
}

const launch: LaunchController = {
  state: { _tag: "Idle" },
  start: () => {},
  retry: () => {},
}
