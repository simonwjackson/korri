import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import type { LaunchController } from "@shared/library/launch-state"
import { LaunchState } from "@shared/library/launch-state"
import { LibraryListStateRoot } from "@shared/library/library-list-state-root"
import {
  type SpatialNavigationHandle,
  startSpatialNavigation,
} from "@shared/navigation/start"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { ShiftHomeReadyBody } from "./ShiftHomeReadyBody"

const games = [
  { id: "resume", metadata: { name: "Resume" } },
  { id: "second", metadata: { name: "Second" } },
]

let handle: SpatialNavigationHandle

beforeEach(() => {
  handle = startSpatialNavigation({ keyboard: false, gamepad: false })
})

afterEach(() => {
  cleanup()
  handle.dispose()
  document.documentElement.style.removeProperty("--ui-scale")
})

describe("ShiftHomeReadyBody", () => {
  it("lets the focused Labs button handle confirm without launching the focused game", async () => {
    const launched: string[] = []

    renderReadyBody({
      state: LaunchState.idle,
      start: game => launched.push(game.id),
      retry: () => {},
    })

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-tile-id")).toBe(
        "resume",
      )
    })

    const labs = screen.getByRole("button", { name: "Labs" })
    labs.focus()

    await act(async () => {
      handle.bus.emit({ type: "confirm" })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(screen.getByRole("dialog", { name: "Labs" })).toBeTruthy()
    expect(launched).toEqual([])
  })

  it("launches the focused tile once when confirm activates the tile button", async () => {
    const launched: string[] = []

    renderReadyBody({
      state: LaunchState.idle,
      start: game => launched.push(game.id),
      retry: () => {},
    })

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-tile-id")).toBe(
        "resume",
      )
    })

    await act(async () => {
      handle.bus.emit({ type: "confirm" })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(launched).toEqual(["resume"])
  })
})

function renderReadyBody(launch: LaunchController) {
  return render(
    <LibraryListStateRoot result={AsyncResult.success(games)}>
      <ShiftHomeReadyBody launch={launch} />
    </LibraryListStateRoot>,
  )
}
