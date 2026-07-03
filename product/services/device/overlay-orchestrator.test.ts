import { describe, expect, it } from "bun:test"
import type { ChordHoldUpdate } from "@platform/input/native/chord-hold-supervisor"
import type { OverlayInterceptController, OverlayNav } from "./overlay-intercept"
import type { OverlayMenuOption } from "./overlay-menu"
import {
  createOverlayOrchestrator,
  type OverlayRendererClient,
} from "./overlay-orchestrator"

type RenderCall =
  | { kind: "ring"; pct: number }
  | { kind: "menu"; options: readonly OverlayMenuOption[]; selected: number }
  | { kind: "hide" }

function createFakeRenderer() {
  const calls: RenderCall[] = []
  const client: OverlayRendererClient = {
    ring: pct => calls.push({ kind: "ring", pct }),
    menu: (options, selected) => calls.push({ kind: "menu", options, selected }),
    hide: () => calls.push({ kind: "hide" }),
  }
  return { client, calls }
}

function createFakeIntercept() {
  let onNav: ((nav: OverlayNav) => void) | null = null
  let active = false
  const controller: OverlayInterceptController = {
    async activate(cb) {
      active = true
      onNav = cb
    },
    async deactivate() {
      active = false
      onNav = null
    },
    isActive: () => active,
  }
  return {
    controller,
    nav: (n: OverlayNav) => onNav?.(n),
    isActive: () => active,
  }
}

function hold(phase: ChordHoldUpdate["phase"], progress = 0): ChordHoldUpdate {
  return { id: "kill-current-game", phase, progress, elapsedMs: 0 }
}

function setup(kind: "local" | "stream" = "local") {
  const renderer = createFakeRenderer()
  const intercept = createFakeIntercept()
  const actions = { forceQuit: 0, closeRemoteGame: 0 }
  const orchestrator = createOverlayOrchestrator({
    renderer: renderer.client,
    intercept: intercept.controller,
    actions: {
      forceQuit: () => {
        actions.forceQuit++
      },
      closeRemoteGame: () => {
        actions.closeRemoteGame++
      },
    },
    sessionKind: () => kind,
  })
  return { renderer, intercept, actions, orchestrator }
}

describe("overlay orchestrator", () => {
  it("shows and fills the ring on press/progress", () => {
    const { renderer, orchestrator } = setup()
    orchestrator.onHoldUpdate(hold("press"))
    orchestrator.onHoldUpdate(hold("progress", 0.5))
    orchestrator.onHoldUpdate(hold("progress", 0.99))
    expect(renderer.calls).toEqual([
      { kind: "ring", pct: 0 },
      { kind: "ring", pct: 50 },
      { kind: "ring", pct: 99 },
    ])
  })

  it("hides and force-quits on fired", () => {
    const { renderer, actions, orchestrator } = setup()
    orchestrator.onHoldUpdate(hold("fired", 1))
    expect(renderer.calls).toEqual([{ kind: "hide" }])
    expect(actions.forceQuit).toBe(1)
  })

  it("gates input on press and ungates on fired (chord never leaks to the game)", () => {
    const { intercept, orchestrator } = setup()
    orchestrator.onHoldUpdate(hold("press"))
    expect(intercept.isActive()).toBe(true) // gated from the first press
    orchestrator.onHoldUpdate(hold("progress", 0.5))
    expect(intercept.isActive()).toBe(true)
    orchestrator.onHoldUpdate(hold("fired", 1))
    expect(intercept.isActive()).toBe(false) // restored after quit
  })

  it("ignores nav while gated but before a menu is open", () => {
    const { intercept, renderer, orchestrator } = setup()
    orchestrator.onHoldUpdate(hold("press"))
    intercept.nav("left") // no menu yet -> ignored
    expect(renderer.calls).toEqual([{ kind: "ring", pct: 0 }])
  })

  it("opens the menu on tap and gates the game", () => {
    const { renderer, intercept, orchestrator } = setup("local")
    orchestrator.onHoldUpdate(hold("tap"))
    expect(orchestrator.isMenuOpen()).toBe(true)
    expect(intercept.isActive()).toBe(true)
    const first = renderer.calls[0]
    expect(first.kind).toBe("menu")
    if (first.kind === "menu") {
      expect(first.options.map(o => o.id)).toEqual(["quit-game", "keep-playing"])
      expect(first.selected).toBe(1) // keep-playing default
    }
  })

  it("moves selection on nav and re-renders", () => {
    const { renderer, intercept, orchestrator } = setup("local")
    orchestrator.onHoldUpdate(hold("tap"))
    intercept.nav("left") // 1 -> 0
    const last = renderer.calls[renderer.calls.length - 1]
    expect(last).toEqual({
      kind: "menu",
      options: expect.anything(),
      selected: 0,
    })
  })

  it("runs quit-game, hides, and ungates on accept", () => {
    const { renderer, intercept, actions, orchestrator } = setup("local")
    orchestrator.onHoldUpdate(hold("tap"))
    intercept.nav("left") // select quit-game
    intercept.nav("accept")
    expect(actions.forceQuit).toBe(1)
    expect(orchestrator.isMenuOpen()).toBe(false)
    expect(intercept.isActive()).toBe(false)
    expect(renderer.calls[renderer.calls.length - 1]).toEqual({ kind: "hide" })
  })

  it("keep-playing takes no action but still closes", () => {
    const { intercept, actions, orchestrator } = setup("local")
    orchestrator.onHoldUpdate(hold("tap")) // default selected = keep-playing
    intercept.nav("accept")
    expect(actions.forceQuit).toBe(0)
    expect(actions.closeRemoteGame).toBe(0)
    expect(orchestrator.isMenuOpen()).toBe(false)
    expect(intercept.isActive()).toBe(false)
  })

  it("cancel (back) closes without any action", () => {
    const { actions, intercept, orchestrator } = setup("local")
    orchestrator.onHoldUpdate(hold("tap"))
    intercept.nav("back")
    expect(actions.forceQuit).toBe(0)
    expect(orchestrator.isMenuOpen()).toBe(false)
    expect(intercept.isActive()).toBe(false)
  })

  it("stream close-game calls the remote stop", () => {
    const { intercept, actions, orchestrator } = setup("stream")
    orchestrator.onHoldUpdate(hold("tap"))
    // stream options: [close-stream, close-game, keep-playing], default keep-playing (2)
    intercept.nav("left") // 2 -> 1 (close-game)
    intercept.nav("accept")
    expect(actions.closeRemoteGame).toBe(1)
    expect(actions.forceQuit).toBe(0)
  })
})
