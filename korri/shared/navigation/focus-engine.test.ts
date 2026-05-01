import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { __resetCenterScrollState } from "./center-scroll"
import { createFocusEngine, type NextFocusFn } from "./focus-engine"

const setupTwoButtons = () => {
  document.body.innerHTML = `
    <div id="scope">
      <button id="first">First</button>
      <button id="second">Second</button>
    </div>
    <button id="outside">Outside</button>
  `
  const scope = document.getElementById("scope") as HTMLElement
  const first = document.getElementById("first") as HTMLButtonElement
  const second = document.getElementById("second") as HTMLButtonElement
  const outside = document.getElementById("outside") as HTMLButtonElement
  second.scrollIntoView = () => undefined
  return { scope, first, second, outside }
}

describe("createFocusEngine", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    __resetCenterScrollState()
  })

  afterEach(() => {
    document.body.innerHTML = ""
    __resetCenterScrollState()
  })

  it("moves focus with the injected nextFocus function", () => {
    const { first, second } = setupTwoButtons()
    const calls: string[] = []
    const nextFocus: NextFocusFn = (current, direction) => {
      calls.push(`${current?.id}:${direction}`)
      return second
    }
    const engine = createFocusEngine({ nextFocus })

    first.focus()
    engine.handle({ type: "direction", direction: "right" })

    expect(calls).toEqual(["first:right"])
    expect(document.activeElement).toBe(second)
  })

  it("focuses the initial element when focus is on body", () => {
    const { first } = setupTwoButtons()
    const engine = createFocusEngine({ nextFocus: () => null })

    engine.handle({ type: "direction", direction: "right" })

    expect(document.activeElement).toBe(first)
  })

  it("focuses the initial element inside scope when active focus is outside", () => {
    const { scope, first, outside } = setupTwoButtons()
    const engine = createFocusEngine({
      nextFocus: () => null,
      scope: () => scope,
    })

    outside.focus()
    engine.handle({ type: "direction", direction: "right" })

    expect(document.activeElement).toBe(first)
  })

  it("clicks the active element on confirm by default", () => {
    const { first } = setupTwoButtons()
    let clicks = 0
    first.addEventListener("click", () => clicks++)
    const engine = createFocusEngine({ nextFocus: () => null })

    first.focus()
    engine.handle({ type: "confirm" })

    expect(clicks).toBe(1)
  })

  it("uses onConfirm instead of clicking when provided", () => {
    const { first } = setupTwoButtons()
    let clicks = 0
    const confirmed: Array<HTMLElement | null> = []
    first.addEventListener("click", () => clicks++)
    const engine = createFocusEngine({
      nextFocus: () => null,
      onConfirm: target => {
        confirmed.push(target)
      },
    })

    first.focus()
    engine.handle({ type: "confirm" })

    expect(clicks).toBe(0)
    expect(confirmed[0]).toBe(first)
  })

  it("focuses next with preventScroll: true so the browser default focus-scroll does not race the centering pass", () => {
    const { first, second } = setupTwoButtons()
    const focusCalls: Array<FocusOptions | undefined> = []
    const originalFocus = second.focus.bind(second)
    second.focus = ((options?: FocusOptions) => {
      focusCalls.push(options)
      return originalFocus(options)
    }) as HTMLElement["focus"]
    const engine = createFocusEngine({ nextFocus: () => second })

    first.focus()
    engine.handle({ type: "direction", direction: "right" })

    expect(focusCalls).toHaveLength(1)
    expect(focusCalls[0]?.preventScroll).toBe(true)
  })

  describe("Mario-camera surfaces", () => {
    /**
     * Build a horizontal Mario rail with three tiles. Inline-axis overflow,
     * 1000px viewport, 1500px content; tile #2 starts at x=500 and is 200px
     * wide.
     */
    function setupMarioRail(): {
      surface: HTMLElement
      first: HTMLButtonElement
      second: HTMLButtonElement
      third: HTMLButtonElement
    } {
      document.body.innerHTML = `
        <div id="surface" data-mario-camera="inline">
          <button id="first">First</button>
          <button id="second">Second</button>
          <button id="third">Third</button>
        </div>
      `
      const surface = document.getElementById("surface") as HTMLElement
      Object.defineProperty(surface, "clientWidth", {
        configurable: true,
        get: () => 1000,
      })
      Object.defineProperty(surface, "scrollWidth", {
        configurable: true,
        get: () => 1500,
      })
      ;(surface as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
        () =>
          ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 1000,
            bottom: 100,
            width: 1000,
            height: 100,
            toJSON: () => ({}),
          }) as DOMRect
      surface.scrollLeft = 0

      const first = document.getElementById("first") as HTMLButtonElement
      const second = document.getElementById("second") as HTMLButtonElement
      const third = document.getElementById("third") as HTMLButtonElement
      const stub = (
        el: HTMLElement,
        left: number,
        width: number,
      ) => {
        ;(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
          () =>
            ({
              x: left,
              y: 0,
              left,
              top: 0,
              right: left + width,
              bottom: 100,
              width,
              height: 100,
              toJSON: () => ({}),
            }) as DOMRect
      }
      stub(first, 0, 200)
      stub(second, 500, 200)
      stub(third, 1000, 200)
      return { surface, first, second, third }
    }

    it("calls the centering util (animated) when next is inside a Mario surface", async () => {
      // Engine routes the focus move through the Mario branch → the util
      // tweens scrollLeft. Tile #2 center 600, surface center 500, delta 100.
      // After ~150ms the tween settles at scrollLeft = 100. We wait 300ms
      // (2x duration) before asserting to avoid race with the real rAF loop.
      const { surface, first, second } = setupMarioRail()
      const engine = createFocusEngine({ nextFocus: () => second })

      first.focus()
      engine.handle({ type: "direction", direction: "right" })

      // scrollLeft is still 0 immediately after the call — first frame
      // hasn't executed yet.
      expect(surface.scrollLeft).toBe(0)

      await new Promise(resolve => setTimeout(resolve, 300))

      expect(surface.scrollLeft).toBe(100)
    })

    it("falls back to scrollIntoView when next has no Mario ancestor", () => {
      // Existing setup with no data-mario-camera anywhere.
      const { second } = setupTwoButtons()
      let scrollIntoViewCalls = 0
      let scrollIntoViewArgs: ScrollIntoViewOptions | undefined
      second.scrollIntoView = ((arg?: ScrollIntoViewOptions | boolean) => {
        scrollIntoViewCalls++
        if (typeof arg === "object") scrollIntoViewArgs = arg
      }) as HTMLElement["scrollIntoView"]
      const first = document.getElementById("first") as HTMLButtonElement
      const engine = createFocusEngine({ nextFocus: () => second })

      first.focus()
      engine.handle({ type: "direction", direction: "right" })

      expect(scrollIntoViewCalls).toBe(1)
      expect(scrollIntoViewArgs).toEqual({
        block: "nearest",
        inline: "nearest",
      })
    })

    it("does not call scrollIntoView on Mario surfaces (no double-scroll)", () => {
      const { first, second } = setupMarioRail()
      let scrollIntoViewCalls = 0
      second.scrollIntoView = (() => {
        scrollIntoViewCalls++
      }) as HTMLElement["scrollIntoView"]
      const engine = createFocusEngine({ nextFocus: () => second })

      first.focus()
      engine.handle({ type: "direction", direction: "right" })

      expect(scrollIntoViewCalls).toBe(0)
    })

    it("treats source: 'wheel' direction the same as keyboard direction (Mario branch fires)", async () => {
      // Coexistence proof: wheel-emitted directions go through the same path
      // as keyboard directions, including Mario centering. The InputAction's
      // source field is informational from the engine's perspective.
      const { surface, first, second } = setupMarioRail()
      const engine = createFocusEngine({ nextFocus: () => second })

      first.focus()
      engine.handle({
        type: "direction",
        direction: "right",
        source: "wheel",
      })

      await new Promise(resolve => setTimeout(resolve, 300))

      expect(surface.scrollLeft).toBe(100)
    })

    it("does not center when programmatic focus bypasses the engine (regression guard for pointer hover)", () => {
      // The pointer adapter calls focusable.focus({preventScroll:true})
      // directly. The engine is never invoked. This test asserts that no
      // implicit hook in the engine catches that focus and centers the rail.
      const { surface, second } = setupMarioRail()
      const _engine = createFocusEngine({ nextFocus: () => second })

      second.focus({ preventScroll: true })

      // No engine call → no Mario centering. scrollLeft stays at 0.
      expect(surface.scrollLeft).toBe(0)
    })
  })

  it("dispatches back, options, and menu callbacks", () => {
    const { first } = setupTwoButtons()
    const seen: string[] = []
    const engine = createFocusEngine({
      nextFocus: () => null,
      onBack: () => seen.push("back"),
      onOptions: target => seen.push(`options:${target?.id}`),
      onMenu: () => seen.push("menu"),
    })

    first.focus()
    engine.handle({ type: "back" })
    engine.handle({ type: "options" })
    engine.handle({ type: "menu" })

    expect(seen).toEqual(["back", "options:first", "menu"])
  })
})
