import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { __resetCenterScrollState } from "./center-scroll"
import { createFocusRestore } from "./focus-restore"

describe("createFocusRestore", () => {
  let scheduled: Array<() => void>
  const flushScheduled = () => {
    const callbacks = scheduled
    scheduled = []
    for (const callback of callbacks) callback()
  }

  beforeEach(() => {
    document.body.innerHTML = ""
    scheduled = []
    __resetCenterScrollState()
  })

  afterEach(() => {
    document.body.innerHTML = ""
    __resetCenterScrollState()
  })

  it("restores focus by aria-label after remount", () => {
    document.body.innerHTML = `<button aria-label="Hades">Hades</button>`
    const restore = createFocusRestore({
      schedule: callback => scheduled.push(callback),
    })

    document.querySelector<HTMLButtonElement>("button")?.focus()
    restore.capture("/")

    document.body.innerHTML = `<button aria-label="Hades">New Hades</button>`
    restore.restore("/")
    flushScheduled()

    expect(document.activeElement?.textContent).toBe("New Hades")
  })

  it("prefers id over aria-label", () => {
    document.body.innerHTML = `<button id="original" aria-label="Duplicate">Original</button>`
    const restore = createFocusRestore({
      schedule: callback => scheduled.push(callback),
    })

    document.querySelector<HTMLButtonElement>("#original")?.focus()
    restore.capture("/")

    document.body.innerHTML = `
      <button aria-label="Duplicate">Wrong</button>
      <button id="original" aria-label="Duplicate">Right</button>
    `
    restore.restore("/")
    flushScheduled()

    expect(document.activeElement?.textContent).toBe("Right")
  })

  it("restores attribute values that are unsafe to interpolate into selectors", () => {
    const label = 'Quote " and newline\n label'
    const restore = createFocusRestore({
      schedule: callback => scheduled.push(callback),
    })

    const initial = document.createElement("button")
    initial.setAttribute("aria-label", label)
    initial.textContent = "Initial"
    document.body.append(initial)
    initial.focus()
    restore.capture("/")

    document.body.innerHTML = ""
    const remounted = document.createElement("button")
    remounted.setAttribute("aria-label", label)
    remounted.textContent = "Remounted"
    document.body.append(remounted)

    restore.restore("/")
    flushScheduled()

    expect(document.activeElement?.textContent).toBe("Remounted")
  })

  it("falls back to a structural path when no accessible key exists", () => {
    document.body.innerHTML = `
      <section>
        <button>First</button>
        <button>Second</button>
      </section>
    `
    const restore = createFocusRestore({
      schedule: callback => scheduled.push(callback),
    })

    document.querySelectorAll<HTMLButtonElement>("button")[1]?.focus()
    restore.capture("/")

    document.body.innerHTML = `
      <section>
        <button>First again</button>
        <button>Second again</button>
      </section>
    `
    restore.restore("/")
    flushScheduled()

    expect(document.activeElement?.textContent).toBe("Second again")
  })

  it("no-ops when the captured element has no match after remount", () => {
    document.body.innerHTML = `<button aria-label="Hades">Hades</button>`
    const restore = createFocusRestore({
      schedule: callback => scheduled.push(callback),
    })

    document.querySelector<HTMLButtonElement>("button")?.focus()
    restore.capture("/")

    document.body.innerHTML = `<button aria-label="Celeste">Celeste</button>`
    restore.restore("/")
    flushScheduled()

    expect(document.activeElement).toBe(document.body)
  })

  it("last capture wins for the same scope key", () => {
    document.body.innerHTML = `
      <button aria-label="First">First</button>
      <button aria-label="Second">Second</button>
    `
    const restore = createFocusRestore({
      schedule: callback => scheduled.push(callback),
    })
    const buttons = document.querySelectorAll<HTMLButtonElement>("button")

    buttons[0]?.focus()
    restore.capture("/")
    buttons[1]?.focus()
    restore.capture("/")

    document.body.innerHTML = `
      <button aria-label="First">New First</button>
      <button aria-label="Second">New Second</button>
    `
    restore.restore("/")
    flushScheduled()

    expect(document.activeElement?.textContent).toBe("New Second")
  })

  it("does not capture focus outside the configured scope", () => {
    document.body.innerHTML = `
      <main id="scope"><button aria-label="Inside">Inside</button></main>
      <button aria-label="Outside">Outside</button>
    `
    const scope = document.getElementById("scope") as HTMLElement
    const restore = createFocusRestore({
      scope: () => scope,
      schedule: callback => scheduled.push(callback),
    })

    document.querySelector<HTMLButtonElement>("[aria-label='Outside']")?.focus()
    restore.capture("/")

    document.body.innerHTML = `<main id="scope"><button aria-label="Outside">New Outside</button></main>`
    restore.restore("/")
    flushScheduled()

    expect(document.activeElement).toBe(document.body)
  })

  describe("Mario-camera integration", () => {
    it("snaps the rail to centered when the restored target lives inside a Mario surface", () => {
      // Build a horizontal Mario rail: 1000px viewport, 1500px content,
      // tile #2 starts at x=500 with width 200 → center 600 → needs
      // scrollLeft = 100 to align with viewport center 500.
      document.body.innerHTML = `
        <div id="rail" data-mario-camera="inline">
          <button id="a" aria-label="A">A</button>
          <button id="b" aria-label="B">B</button>
          <button id="c" aria-label="C">C</button>
        </div>
      `
      const rail = document.getElementById("rail") as HTMLElement
      Object.defineProperty(rail, "clientWidth", {
        configurable: true,
        get: () => 1000,
      })
      Object.defineProperty(rail, "scrollWidth", {
        configurable: true,
        get: () => 1500,
      })
      ;(
        rail as unknown as { getBoundingClientRect: () => DOMRect }
      ).getBoundingClientRect = () =>
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
      rail.scrollLeft = 0

      const tileB = document.getElementById("b") as HTMLButtonElement
      ;(
        tileB as unknown as { getBoundingClientRect: () => DOMRect }
      ).getBoundingClientRect = () =>
        ({
          x: 500,
          y: 0,
          left: 500,
          top: 0,
          right: 700,
          bottom: 100,
          width: 200,
          height: 100,
          toJSON: () => ({}),
        }) as DOMRect

      const restore = createFocusRestore({
        schedule: callback => scheduled.push(callback),
      })
      tileB.focus()
      restore.capture("/")

      // Simulate a remount that re-creates the same DOM. We don't actually
      // teardown / reattach — the elements still exist with the captured
      // identity. (Equivalent to a route round-trip with the same scope.)
      // Reset scrollLeft to prove the snap re-establishes centered.
      rail.scrollLeft = 0
      ;(document.activeElement as HTMLElement | null)?.blur()

      restore.restore("/")
      flushScheduled()

      expect(document.activeElement).toBe(tileB)
      expect(rail.scrollLeft).toBe(100)
    })

    it("does not change scrollLeft for non-Mario restore targets (regression guard)", () => {
      // Plain DOM with no data-mario-camera anywhere. Restore should focus
      // the target via focus({preventScroll:true}) and the centering util
      // should be a no-op.
      document.body.innerHTML = `
        <div id="plain">
          <button aria-label="Hades">Hades</button>
        </div>
      `
      const wrapper = document.getElementById("plain") as HTMLElement
      wrapper.scrollLeft = 42 // arbitrary non-zero starting value
      const button = document.querySelector<HTMLButtonElement>("button")
      if (!button) throw new Error("setup failed: missing button")
      button.focus()

      const restore = createFocusRestore({
        schedule: callback => scheduled.push(callback),
      })
      restore.capture("/")
      ;(document.activeElement as HTMLElement | null)?.blur()

      restore.restore("/")
      flushScheduled()

      expect(document.activeElement).toBe(button)
      // No data-mario-camera → util walks up, finds nothing, returns. The
      // wrapper's pre-existing scrollLeft is untouched.
      expect(wrapper.scrollLeft).toBe(42)
    })

    it("calls focus with preventScroll: true", () => {
      document.body.innerHTML = `<button aria-label="Hades">Hades</button>`
      const button = document.querySelector<HTMLButtonElement>("button")
      if (!button) throw new Error("setup failed: missing button")
      const focusOptions: Array<FocusOptions | undefined> = []
      const originalFocus = button.focus.bind(button)
      button.focus = ((options?: FocusOptions) => {
        focusOptions.push(options)
        return originalFocus(options)
      }) as HTMLElement["focus"]

      const restore = createFocusRestore({
        schedule: callback => scheduled.push(callback),
      })
      // Capture via a different focused element first to avoid catching
      // the spy call from `button.focus()` during capture phase.
      button.focus({ preventScroll: true })
      restore.capture("/")
      focusOptions.length = 0
      ;(document.activeElement as HTMLElement | null)?.blur()

      restore.restore("/")
      flushScheduled()

      expect(focusOptions).toHaveLength(1)
      expect(focusOptions[0]?.preventScroll).toBe(true)
    })

    it("does not throw when the captured target no longer exists in the DOM", () => {
      document.body.innerHTML = `<button aria-label="Gone">Gone</button>`
      const button = document.querySelector<HTMLButtonElement>("button")
      if (!button) throw new Error("setup failed: missing button")
      button.focus()

      const restore = createFocusRestore({
        schedule: callback => scheduled.push(callback),
      })
      restore.capture("/")

      document.body.innerHTML = "" // Element is gone after "remount".

      expect(() => {
        restore.restore("/")
        flushScheduled()
      }).not.toThrow()
    })
  })

  it("clear forgets captured focus", () => {
    document.body.innerHTML = `<button aria-label="Hades">Hades</button>`
    const restore = createFocusRestore({
      schedule: callback => scheduled.push(callback),
    })

    document.querySelector<HTMLButtonElement>("button")?.focus()
    restore.capture("/")
    restore.clear()

    document.body.innerHTML = `<button aria-label="Hades">New Hades</button>`
    restore.restore("/")
    flushScheduled()

    expect(document.activeElement).toBe(document.body)
  })
})
