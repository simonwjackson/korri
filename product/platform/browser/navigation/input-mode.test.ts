import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createInputModeStore } from "./input-mode"

describe("createInputModeStore", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-input-mode")
  })

  afterEach(() => {
    document.documentElement.removeAttribute("data-input-mode")
  })

  it("starts in pointer mode by default and writes the attribute", () => {
    const store = createInputModeStore()

    expect(store.getMode()).toBe("pointer")
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )

    store.dispose()
  })

  it("honors a custom initial mode", () => {
    const store = createInputModeStore({ initialMode: "directional" })

    expect(store.getMode()).toBe("directional")
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "directional",
    )

    store.dispose()
  })

  it("flips to directional mode and updates the attribute", () => {
    const store = createInputModeStore()

    store.setDirectionalMode()

    expect(store.getMode()).toBe("directional")
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "directional",
    )

    store.dispose()
  })

  it("flips back to pointer mode and updates the attribute", () => {
    const store = createInputModeStore({ initialMode: "directional" })

    store.setPointerMode()

    expect(store.getMode()).toBe("pointer")
    expect(document.documentElement.getAttribute("data-input-mode")).toBe(
      "pointer",
    )

    store.dispose()
  })

  it("notifies subscribers on every transition", () => {
    const store = createInputModeStore()
    const seen: string[] = []
    const unsubscribe = store.subscribe(mode => seen.push(mode))

    store.setDirectionalMode()
    store.setPointerMode()
    store.setDirectionalMode()

    expect(seen).toEqual(["directional", "pointer", "directional"])

    unsubscribe()
    store.dispose()
  })

  it("does not notify subscribers when the mode does not change", () => {
    const store = createInputModeStore()
    const seen: string[] = []
    const unsubscribe = store.subscribe(mode => seen.push(mode))

    // Already in pointer mode.
    store.setPointerMode()
    store.setPointerMode()

    expect(seen).toEqual([])

    unsubscribe()
    store.dispose()
  })

  it("unsubscribe stops further notifications", () => {
    const store = createInputModeStore()
    const seen: string[] = []
    const unsubscribe = store.subscribe(mode => seen.push(mode))

    store.setDirectionalMode()
    unsubscribe()
    store.setPointerMode()

    expect(seen).toEqual(["directional"])

    store.dispose()
  })

  it("dispose clears listeners and removes the attribute", () => {
    const store = createInputModeStore()
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })

    store.dispose()

    expect(document.documentElement.hasAttribute("data-input-mode")).toBe(false)

    // After dispose, set* still mutates in-memory mode but listeners are gone.
    store.setDirectionalMode()
    expect(calls).toBe(0)
  })

  it("snapshots listeners so they can unsubscribe during dispatch", () => {
    const store = createInputModeStore()
    const seen: string[] = []
    let unsubscribeA: (() => void) | undefined
    unsubscribeA = store.subscribe(mode => {
      seen.push(`a:${mode}`)
      unsubscribeA?.()
    })
    store.subscribe(mode => seen.push(`b:${mode}`))

    store.setDirectionalMode()
    store.setPointerMode()

    expect(seen).toEqual(["a:directional", "b:directional", "b:pointer"])

    store.dispose()
  })
})
