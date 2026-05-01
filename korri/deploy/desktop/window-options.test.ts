import { describe, expect, test } from "bun:test"
import { buildDesktopUrl, createDesktopWindowOptions } from "./window-options"

describe("desktop window options", () => {
  test("builds a loopback URL from the bound server port", () => {
    expect(buildDesktopUrl({ host: "127.0.0.1", port: 4321 })).toBe(
      "http://127.0.0.1:4321/",
    )
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
})
