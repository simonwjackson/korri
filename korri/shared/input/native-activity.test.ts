import { describe, expect, it } from "bun:test"
import { createBrowserNativeInputActivitySource } from "./native-activity"

class EventTargetLike extends EventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    super.addEventListener(type, listener)
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    super.removeEventListener(type, listener)
  }
}

function createActivityHarness() {
  const windowRef = new EventTargetLike()
  const documentTarget = new EventTargetLike()
  let visible = true
  let focused = true
  const documentRef = {
    addEventListener: documentTarget.addEventListener.bind(documentTarget),
    removeEventListener:
      documentTarget.removeEventListener.bind(documentTarget),
    get visibilityState() {
      return visible ? "visible" : "hidden"
    },
    hasFocus: () => focused,
  } as const

  return {
    windowRef,
    documentTarget,
    documentRef,
    blur() {
      focused = false
      windowRef.dispatchEvent(new Event("blur"))
    },
    focus() {
      focused = true
      windowRef.dispatchEvent(new Event("focus"))
    },
    hide() {
      visible = false
      documentTarget.dispatchEvent(new Event("visibilitychange"))
    },
    show() {
      visible = true
      documentTarget.dispatchEvent(new Event("visibilitychange"))
    },
  }
}

describe("browser native input activity source", () => {
  it("is active only when the document is visible and focused", () => {
    const harness = createActivityHarness()
    const source = createBrowserNativeInputActivitySource(harness)

    expect(source.current()).toBe(true)
    harness.blur()
    expect(source.current()).toBe(false)
    harness.focus()
    expect(source.current()).toBe(true)
    harness.hide()
    expect(source.current()).toBe(false)
  })

  it("notifies subscribers when focus or visibility changes", () => {
    const harness = createActivityHarness()
    const source = createBrowserNativeInputActivitySource(harness)
    const states: boolean[] = []

    const unsubscribe = source.subscribe(active => states.push(active))
    harness.blur()
    harness.focus()
    harness.hide()
    unsubscribe()
    harness.show()

    expect(states).toEqual([false, true, false])
  })

  it("falls back to always active without browser globals", () => {
    const source = createBrowserNativeInputActivitySource({
      windowRef: undefined,
      documentRef: undefined,
    })
    const states: boolean[] = []

    const unsubscribe = source.subscribe(active => states.push(active))
    unsubscribe()

    expect(source.current()).toBe(true)
    expect(states).toEqual([])
  })
})
