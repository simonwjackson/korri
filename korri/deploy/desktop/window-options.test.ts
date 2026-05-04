import { describe, expect, test } from "bun:test"
import {
  buildDesktopUrl,
  createDesktopDualScreenWindowOptions,
  createDesktopWindowOptions,
} from "./window-options"

describe("desktop window options", () => {
  test("builds a loopback URL from the bound server port", () => {
    expect(buildDesktopUrl({ host: "127.0.0.1", port: 4321 })).toBe(
      "http://127.0.0.1:4321/",
    )
    expect(
      buildDesktopUrl(
        { host: "127.0.0.1", port: 4321 },
        "/screen?role=primary",
      ),
    ).toBe("http://127.0.0.1:4321/screen?role=primary")
  })

  test("rejects an invalid bound port", () => {
    expect(() => buildDesktopUrl({ host: "127.0.0.1", port: 0 })).toThrow(
      "Desktop server port must be a positive integer",
    )
  })

  test("uses deterministic window defaults", () => {
    const options = createDesktopWindowOptions({
      host: "127.0.0.1",
      port: 4321,
    })

    expect(options).toEqual({
      title: "Korri",
      url: "http://127.0.0.1:4321/",
      frame: {
        x: 120,
        y: 80,
        width: 1280,
        height: 800,
      },
      titleBarStyle: "default",
    })
  })

  test("builds ratio-correct dual-screen window defaults", () => {
    const options = createDesktopDualScreenWindowOptions({
      host: "127.0.0.1",
      port: 4321,
    })

    expect(options.primary.url).toBe(
      "http://127.0.0.1:4321/screen?role=primary",
    )
    expect(options.companion.url).toBe(
      "http://127.0.0.1:4321/screen?role=companion",
    )
    expect(
      options.primary.frame.width / options.primary.frame.height,
    ).toBeCloseTo(16 / 9)
    expect(
      options.companion.frame.width / options.companion.frame.height,
    ).toBeCloseTo(8 / 7)
  })
})
