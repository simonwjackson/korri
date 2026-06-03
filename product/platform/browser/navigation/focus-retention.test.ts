import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createFocusRetention } from "./focus-retention"

describe("createFocusRetention", () => {
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

  it("restores a retained button when focus falls back to body", () => {
    document.body.innerHTML = `<button id="tile">Tile</button>`
    const button = document.getElementById("tile") as HTMLButtonElement
    const retention = createFocusRetention({
      schedule: callback => scheduled.push(callback),
    })

    button.focus()
    button.blur()
    flushScheduled()

    expect(document.activeElement).toBe(button)

    retention.dispose()
  })

  it("does not restore the previous button when another focusable receives focus", () => {
    document.body.innerHTML = `
      <button id="first">First</button>
      <button id="second">Second</button>
    `
    const first = document.getElementById("first") as HTMLButtonElement
    const second = document.getElementById("second") as HTMLButtonElement
    const retention = createFocusRetention({
      schedule: callback => scheduled.push(callback),
    })

    first.focus()
    second.focus()
    flushScheduled()

    expect(document.activeElement).toBe(second)

    retention.dispose()
  })

  it("does not restore a retained element after it disconnects", () => {
    document.body.innerHTML = `<button id="tile">Tile</button>`
    const button = document.getElementById("tile") as HTMLButtonElement
    const retention = createFocusRetention({
      schedule: callback => scheduled.push(callback),
    })

    button.focus()
    button.blur()
    button.remove()
    flushScheduled()

    expect(document.activeElement).toBe(document.body)

    retention.dispose()
  })

  it("does not retain editable elements", () => {
    document.body.innerHTML = `<input id="search" />`
    const input = document.getElementById("search") as HTMLInputElement
    const retention = createFocusRetention({
      schedule: callback => scheduled.push(callback),
    })

    input.focus()
    input.blur()
    flushScheduled()

    expect(document.activeElement).toBe(document.body)

    retention.dispose()
  })

  it("does not retain elements that are ignored by spatial navigation", () => {
    document.body.innerHTML = `
      <button id="disabled-tab" tabindex="-1">Disabled tab</button>
      <div class="lrud-ignore"><button id="ignored">Ignored</button></div>
    `
    const disabledTab = document.getElementById(
      "disabled-tab",
    ) as HTMLButtonElement
    const ignored = document.getElementById("ignored") as HTMLButtonElement
    const retention = createFocusRetention({
      schedule: callback => scheduled.push(callback),
    })

    disabledTab.focus()
    disabledTab.blur()
    ignored.focus()
    ignored.blur()
    flushScheduled()

    expect(document.activeElement).toBe(document.body)

    retention.dispose()
  })

  it("does not restore after dispose even when a restore is pending", () => {
    document.body.innerHTML = `<button id="tile">Tile</button>`
    const button = document.getElementById("tile") as HTMLButtonElement
    const retention = createFocusRetention({
      schedule: callback => scheduled.push(callback),
    })

    button.focus()
    button.blur()
    retention.dispose()
    flushScheduled()

    expect(document.activeElement).toBe(document.body)
  })
})
