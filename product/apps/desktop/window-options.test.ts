import { describe, expect, test } from "bun:test"
import {
  buildDesktopUrl,
  createDesktopDualScreenWindowOptions,
  createDesktopWindowOptions,
  desktopProfileFromEnv,
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

  test("reads only the supported desktop profile values", () => {
    expect(desktopProfileFromEnv("device")).toBe("device")
    expect(desktopProfileFromEnv("legacy-device")).toBe("default")
    expect(desktopProfileFromEnv("unknown")).toBe("default")
    expect(desktopProfileFromEnv(undefined)).toBe("default")
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

  test("uses device window options", () => {
    const options = createDesktopWindowOptions(
      {
        host: "127.0.0.1",
        port: 4321,
      },
      "device",
    )

    expect(options).toEqual({
      title: "Korri",
      url: "http://127.0.0.1:4321/",
      frame: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      },
      titleBarStyle: "hidden",
    })
  })

  test("builds ratio-correct dual-screen window defaults", () => {
    const options = createDesktopDualScreenWindowOptions({
      host: "127.0.0.1",
      port: 4321,
    })

    const primary = new URL(options.primary.url)
    const companion = new URL(options.companion.url)
    expect(primary.pathname).toBe("/screen")
    expect(companion.pathname).toBe("/screen")
    expect(primary.searchParams.get("role")).toBe("primary")
    expect(companion.searchParams.get("role")).toBe("companion")
    expect(primary.searchParams.get("session")).toBeTruthy()
    expect(companion.searchParams.get("session")).toBe(
      primary.searchParams.get("session"),
    )
    expect(primary.hash).toBe("#/")
    expect(companion.hash).toBe("#/companion")
    expect(
      options.primary.frame.width / options.primary.frame.height,
    ).toBeCloseTo(16 / 9)
    expect(
      options.companion.frame.width / options.companion.frame.height,
    ).toBeCloseTo(8 / 7)
  })
})
