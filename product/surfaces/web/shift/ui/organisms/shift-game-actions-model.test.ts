import { describe, expect, it } from "bun:test"
import {
  type ShiftGameActionsHandlers,
  type ShiftGameActionsState,
  type ShiftGameActionView,
  shiftGameActionsModel,
} from "./shift-game-actions-model"

const baseState: ShiftGameActionsState = {
  favorite: false,
  played: false,
  running: false,
  releaseCount: 1,
  hasProviderLink: false,
  local: false,
}

function model(
  state: Partial<ShiftGameActionsState>,
  handlers: ShiftGameActionsHandlers = {},
) {
  const groups = shiftGameActionsModel({
    state: { ...baseState, ...state },
    handlers,
  })
  const byId = new Map<string, ShiftGameActionView>()
  for (const group of groups) {
    for (const action of group.actions) byId.set(action.id, action)
  }
  return { groups, action: (id: string) => byId.get(id) }
}

describe("shiftGameActionsModel", () => {
  it("always emits every group in a stable order", () => {
    const { groups } = model({})
    expect(groups.map(group => group.id)).toEqual([
      "play",
      "organize",
      "content",
      "settings",
      "danger",
    ])
  })

  it("shows the full catalog regardless of what is wired", () => {
    const { action } = model({})
    for (const id of [
      "play",
      "new-game",
      "play-with",
      "stream",
      "stop",
      "favorite",
      "add-to-collection",
      "open-details",
      "reacquire",
      "view-in-source",
      "manage-releases",
      "game-settings",
      "default-runtime",
      "remove",
    ]) {
      expect(action(id)).toBeDefined()
    }
  })

  it("flips Play to Continue once played", () => {
    expect(model({ played: false }).action("play")?.label).toBe("Play")
    expect(model({ played: true }).action("play")?.label).toBe("Continue")
  })

  it("flips Favorite to Unfavorite when favorited", () => {
    expect(model({ favorite: false }).action("favorite")?.label).toBe(
      "Favorite",
    )
    expect(model({ favorite: true }).action("favorite")?.label).toBe(
      "Unfavorite",
    )
  })

  it("enables a row only when applicable AND wired", () => {
    // Applicable but unwired → disabled, no command.
    const unwired = model({}).action("play")
    expect(unwired?.enabled).toBe(false)
    expect(unwired?.onSelect).toBeUndefined()

    // Applicable and wired → enabled, command is the handler.
    const onPlay = () => {}
    const wired = model({}, { onPlay }).action("play")
    expect(wired?.enabled).toBe(true)
    expect(wired?.onSelect).toBe(onPlay)
  })

  it("keeps inapplicable rows disabled even when wired", () => {
    const onStop = () => {}
    expect(model({ running: false }, { onStop }).action("stop")?.enabled).toBe(
      false,
    )
    expect(model({ running: true }, { onStop }).action("stop")?.enabled).toBe(
      true,
    )
  })

  it("gates New Game on play history", () => {
    const onNewGame = () => {}
    expect(
      model({ played: false }, { onNewGame }).action("new-game")?.enabled,
    ).toBe(false)
    expect(
      model({ played: true }, { onNewGame }).action("new-game")?.enabled,
    ).toBe(true)
  })

  it("gates Play with… on multiple releases", () => {
    const onPlayWith = () => {}
    expect(
      model({ releaseCount: 1 }, { onPlayWith }).action("play-with")?.enabled,
    ).toBe(false)
    expect(
      model({ releaseCount: 2 }, { onPlayWith }).action("play-with")?.enabled,
    ).toBe(true)
  })

  it("gates View in source on a provider link", () => {
    const onViewInSource = () => {}
    expect(
      model({ hasProviderLink: false }, { onViewInSource }).action(
        "view-in-source",
      )?.enabled,
    ).toBe(false)
    expect(
      model({ hasProviderLink: true }, { onViewInSource }).action(
        "view-in-source",
      )?.enabled,
    ).toBe(true)
  })

  it("gates Remove on local ownership and marks it destructive", () => {
    const onRemove = () => {}
    const remote = model({ local: false }, { onRemove }).action("remove")
    expect(remote?.tone).toBe("danger")
    expect(remote?.enabled).toBe(false)
    expect(model({ local: true }, { onRemove }).action("remove")?.enabled).toBe(
      true,
    )
  })
})
