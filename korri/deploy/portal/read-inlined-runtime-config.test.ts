import { describe, expect, test } from "bun:test"
import { readInlinedRuntimeConfig } from "./read-inlined-runtime-config"

/**
 * `readInlinedRuntimeConfig` is the boot-time consumer of the
 * `window.__korriRuntimeConfig` global the bun side inlines into
 * `index.html`. The function is pure (takes a `Window`-shaped target,
 * returns a `RuntimeConfig`) so the test drives it with a plain object.
 */

type WindowLike = { __korriRuntimeConfig?: unknown }

function targetWith(config: unknown): Window {
  return { __korriRuntimeConfig: config } as unknown as Window
}

function targetWithout(): Window {
  return {} as unknown as Window
}

describe("readInlinedRuntimeConfig", () => {
  test("returns desktopInput: true when the inlined value sets it", () => {
    const result = readInlinedRuntimeConfig(
      targetWith({ desktopInput: true }),
    )

    expect(result).toEqual({ desktopInput: true })
  })

  test("returns desktopInput: false when the inlined value sets it", () => {
    const result = readInlinedRuntimeConfig(
      targetWith({ desktopInput: false }),
    )

    expect(result).toEqual({ desktopInput: false })
  })

  test("returns default { desktopInput: false } when the global is absent", () => {
    expect(readInlinedRuntimeConfig(targetWithout())).toEqual({
      desktopInput: false,
    })
  })

  test("returns default when the global has the wrong shape", () => {
    const cases: WindowLike[] = [
      { __korriRuntimeConfig: { desktopInput: "true" } },
      { __korriRuntimeConfig: {} },
      { __korriRuntimeConfig: null },
      { __korriRuntimeConfig: "hello" },
      { __korriRuntimeConfig: 1 },
    ]

    for (const target of cases) {
      expect(readInlinedRuntimeConfig(target as unknown as Window)).toEqual({
        desktopInput: false,
      })
    }
  })

  test("forward-compat: extra unknown fields are ignored, valid value preserved", () => {
    const result = readInlinedRuntimeConfig(
      targetWith({ desktopInput: true, futureField: 42 }),
    )

    expect(result.desktopInput).toBe(true)
  })
})
