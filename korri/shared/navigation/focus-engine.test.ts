import { afterEach, beforeEach, describe, expect, it } from "bun:test"
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
  })

  afterEach(() => {
    document.body.innerHTML = ""
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
