import { describe, expect, it } from "bun:test"
import type { ChordHoldUpdate } from "@platform/input/native/chord-hold-supervisor"
import type {
  OverlayInterceptController,
  OverlayNav,
} from "./overlay-intercept"
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
    menu: (options, selected) =>
      calls.push({ kind: "menu", options, selected }),
    hide: () => calls.push({ kind: "hide" }),
  }
  return { client, calls }
}

function createFakeIntercept() {
  let onNav: ((nav: OverlayNav) => void) | null = null
  let onChord: (() => void) | null = null
  let active = false
  const controller: OverlayInterceptController = {
    async activate(cb, chordCb) {
      active = true
      onNav = cb
      onChord = chordCb ?? null
    },
    async deactivate() {
      active = false
      onNav = null
      onChord = null
    },
    isActive: () => active,
  }
  return {
    controller,
    nav: (n: OverlayNav) => onNav?.(n),
    chord: () => onChord?.(),
    isActive: () => active,
  }
}

function hold(phase: ChordHoldUpdate["phase"], progress = 0): ChordHoldUpdate {
  return { id: "kill-current-game", phase, progress, elapsedMs: 0 }
}

function setup(
  kind: "local" | "stream" = "local",
  opts: {
    readonly sessionActive?: () => boolean
    readonly freezeState?: () => { available: boolean; frozen: boolean }
  } = {},
) {
  const renderer = createFakeRenderer()
  const intercept = createFakeIntercept()
  const actions = {
    forceQuit: 0,
    closeRemoteGame: 0,
    freezeGame: 0,
    resumeGame: 0,
  }
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
      freezeGame: () => {
        actions.freezeGame++
      },
      resumeGame: () => {
        actions.resumeGame++
      },
    },
    sessionKind: () => kind,
    isSessionActive: opts.sessionActive ?? (() => true),
    ...(opts.freezeState ? { freezeState: opts.freezeState } : {}),
  })
  return { renderer, intercept, actions, orchestrator }
}

describe("overlay orchestrator", () => {
  it("fills the ring on progress but shows nothing on press (buffer)", () => {
    const { renderer, orchestrator } = setup()
    orchestrator.onHoldUpdate(hold("press"))
    expect(renderer.calls).toEqual([]) // buffer: no ring on press
    orchestrator.onHoldUpdate(hold("progress", 0.5))
    orchestrator.onHoldUpdate(hold("progress", 0.99))
    expect(renderer.calls).toEqual([
      { kind: "ring", pct: 50 },
      { kind: "ring", pct: 99 },
    ])
  })

  it("cancel abandons the gesture: hides and ungates, no action", () => {
    const { renderer, intercept, actions, orchestrator } = setup()
    orchestrator.onHoldUpdate(hold("press"))
    orchestrator.onHoldUpdate(hold("progress", 0.5))
    orchestrator.onHoldUpdate(hold("cancel", 0.5))
    expect(actions.forceQuit).toBe(0)
    expect(actions.closeRemoteGame).toBe(0)
    expect(intercept.isActive()).toBe(false)
    expect(renderer.calls.at(-1)).toEqual({ kind: "hide" })
  })

  it("hides and force-quits a local game on fired", () => {
    const { renderer, actions, orchestrator } = setup("local")
    orchestrator.onHoldUpdate(hold("fired", 1))
    expect(renderer.calls).toEqual([{ kind: "hide" }])
    expect(actions.forceQuit).toBe(1)
    expect(actions.closeRemoteGame).toBe(0)
  })

  it("kills the remote host game and closes the local stream on fired", () => {
    const { renderer, actions, orchestrator } = setup("stream")
    orchestrator.onHoldUpdate(hold("fired", 1))
    expect(renderer.calls).toEqual([{ kind: "hide" }])
    expect(actions.closeRemoteGame).toBe(1)
    expect(actions.forceQuit).toBe(1)
  })

  it("does not gate during the hold (inputd keeps reading the chord)", () => {
    const { intercept, orchestrator } = setup()
    orchestrator.onHoldUpdate(hold("press"))
    expect(intercept.isActive()).toBe(false)
    orchestrator.onHoldUpdate(hold("progress", 0.5))
    expect(intercept.isActive()).toBe(false)
    orchestrator.onHoldUpdate(hold("fired", 1))
    expect(intercept.isActive()).toBe(false)
  })

  it("the dismiss chord (re-pressed while gated) closes an open menu", () => {
    const { intercept, actions, orchestrator } = setup("local")
    orchestrator.onHoldUpdate(hold("tap")) // open
    expect(orchestrator.isMenuOpen()).toBe(true)
    intercept.chord() // same chord again, surfaced from dbus0 while gated
    expect(orchestrator.isMenuOpen()).toBe(false)
    expect(intercept.isActive()).toBe(false)
    expect(actions.forceQuit).toBe(0)
    expect(actions.closeRemoteGame).toBe(0)
  })

  it("a second tap dismisses an open menu", () => {
    const { intercept, orchestrator } = setup()
    orchestrator.onHoldUpdate(hold("tap")) // open
    expect(orchestrator.isMenuOpen()).toBe(true)
    expect(intercept.isActive()).toBe(true)
    orchestrator.onHoldUpdate(hold("tap")) // repeat -> close
    expect(orchestrator.isMenuOpen()).toBe(false)
    expect(intercept.isActive()).toBe(false)
  })

  it("opens the menu on tap and gates the game", async () => {
    const { renderer, intercept, orchestrator } = setup("local")
    orchestrator.onHoldUpdate(hold("tap"))
    expect(orchestrator.isMenuOpen()).toBe(true)
    expect(intercept.isActive()).toBe(true)
    // The menu frame is drawn only after the intercept is confirmed hot.
    await Promise.resolve()
    const first = renderer.calls[0]
    expect(first.kind).toBe("menu")
    if (first.kind === "menu") {
      expect(first.options.map(o => o.id)).toEqual([
        "quit-game",
        "keep-playing",
      ])
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

  it("offers freeze-game when freeze is available and routes it to the action", () => {
    const { intercept, actions, orchestrator } = setup("local", {
      freezeState: () => ({ available: true, frozen: false }),
    })
    orchestrator.onHoldUpdate(hold("tap"))
    // local options: [quit-game, freeze-game, keep-playing], default keep-playing (2)
    intercept.nav("left") // 2 -> 1 (freeze-game)
    intercept.nav("accept")
    expect(actions.freezeGame).toBe(1)
    expect(actions.forceQuit).toBe(0)
    expect(orchestrator.isMenuOpen()).toBe(false)
  })

  it("offers resume-game when frozen and routes it to the resume action", () => {
    const { intercept, actions, orchestrator } = setup("stream", {
      freezeState: () => ({ available: true, frozen: true }),
    })
    orchestrator.onHoldUpdate(hold("tap"))
    // stream options: [close-stream, close-game, resume-game, keep-playing]
    intercept.nav("left") // keep-playing -> resume-game
    intercept.nav("accept")
    expect(actions.resumeGame).toBe(1)
    expect(actions.freezeGame).toBe(0)
  })

  it("omits the freeze option when freeze is unavailable", () => {
    const { intercept, actions, orchestrator } = setup("local", {
      freezeState: () => ({ available: false, frozen: false }),
    })
    orchestrator.onHoldUpdate(hold("tap"))
    // Without freeze the local menu is [quit-game, keep-playing]; one step
    // left of the safe default must land on quit-game, not freeze-game.
    intercept.nav("left")
    intercept.nav("accept")
    expect(actions.forceQuit).toBe(1)
    expect(actions.freezeGame).toBe(0)
  })

  it("chord hold (fired) still force-quits and never freezes", () => {
    const { actions, orchestrator } = setup("local", {
      freezeState: () => ({ available: true, frozen: false }),
    })
    orchestrator.onHoldUpdate(hold("fired", 1))
    expect(actions.forceQuit).toBe(1)
    expect(actions.freezeGame).toBe(0)
    expect(actions.resumeGame).toBe(0)
  })

  describe("session scoping", () => {
    it("renders nothing and never quits when no session is active", () => {
      const { renderer, intercept, actions, orchestrator } = setup("local", {
        sessionActive: () => false,
      })
      orchestrator.onHoldUpdate(hold("press"))
      orchestrator.onHoldUpdate(hold("progress", 0.5))
      orchestrator.onHoldUpdate(hold("tap"))
      orchestrator.onHoldUpdate(hold("fired", 1))
      // hide() is the only permitted render; no ring, no menu.
      expect(renderer.calls.some(c => c.kind === "ring")).toBe(false)
      expect(renderer.calls.some(c => c.kind === "menu")).toBe(false)
      expect(actions.forceQuit).toBe(0)
      expect(intercept.isActive()).toBe(false)
      expect(orchestrator.isMenuOpen()).toBe(false)
    })

    it("tears down an open menu when the session ends mid-gesture", () => {
      const active = { value: true }
      const { renderer, intercept, orchestrator } = setup("local", {
        sessionActive: () => active.value,
      })
      orchestrator.onHoldUpdate(hold("tap"))
      expect(orchestrator.isMenuOpen()).toBe(true)
      active.value = false
      orchestrator.onHoldUpdate(hold("progress", 0.2))
      expect(orchestrator.isMenuOpen()).toBe(false)
      expect(intercept.isActive()).toBe(false)
      expect(renderer.calls.at(-1)).toEqual({ kind: "hide" })
    })
  })

  describe("touch selection", () => {
    it("confirms the tapped option directly (a tap acts)", () => {
      const { actions, orchestrator } = setup("local")
      orchestrator.onHoldUpdate(hold("tap"))
      // local options: [quit-game(0, danger), keep-playing(1)]
      orchestrator.onTouchSelect(0)
      expect(actions.forceQuit).toBe(1)
      expect(orchestrator.isMenuOpen()).toBe(false)
    })

    it("cancels the menu on a negative touch index", () => {
      const { actions, intercept, orchestrator } = setup("local")
      orchestrator.onHoldUpdate(hold("tap"))
      orchestrator.onTouchSelect(-1)
      expect(actions.forceQuit).toBe(0)
      expect(orchestrator.isMenuOpen()).toBe(false)
      expect(intercept.isActive()).toBe(false)
    })

    it("ignores touch when no menu is open", () => {
      const { actions, orchestrator } = setup("local")
      orchestrator.onTouchSelect(0)
      expect(actions.forceQuit).toBe(0)
      expect(orchestrator.isMenuOpen()).toBe(false)
    })

    it("stream close-game via touch stops the remote", () => {
      const { actions, orchestrator } = setup("stream")
      orchestrator.onHoldUpdate(hold("tap"))
      // stream options: [close-stream(0), close-game(1), keep-playing(2)]
      orchestrator.onTouchSelect(1)
      expect(actions.closeRemoteGame).toBe(1)
      expect(actions.forceQuit).toBe(0)
    })
  })
})
