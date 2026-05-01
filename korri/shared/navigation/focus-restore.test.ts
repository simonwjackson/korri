import { afterEach, beforeEach, describe, expect, it } from "bun:test"
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
  })

  afterEach(() => {
    document.body.innerHTML = ""
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
