import { describe, expect, it } from "bun:test"
import { composeWebChromiumArgs } from "./chromium-args"

describe("composeWebChromiumArgs", () => {
  it("emits the fixed base flags with the locator substituted", () => {
    const args = composeWebChromiumArgs({ locator: "https://example/index.html" })
    expect(args).toEqual([
      "--ozone-platform=x11",
      "--app=https://example/index.html",
      "--no-sandbox",
      "--ignore-gpu-blocklist",
      "--no-first-run",
      "--no-default-browser-check",
      "--start-fullscreen",
      "--kiosk",
      "--autoplay-policy=no-user-gesture-required",
    ])
  })

  it("never includes the infobar/scrollbar-triggering flags", () => {
    const args = composeWebChromiumArgs({ locator: "file:///app/index.html" })
    expect(args).not.toContain("--disable-gpu-sandbox")
    expect(args).not.toContain("--test-type")
  })

  it("honors the default autoplay policy when requested", () => {
    const args = composeWebChromiumArgs({ locator: "u", autoplay: "default" })
    expect(args).toContain("--autoplay-policy=user-gesture-required")
    expect(args).not.toContain("--autoplay-policy=no-user-gesture-required")
  })

  it("appends engine/launcher extra flags after the base set", () => {
    const args = composeWebChromiumArgs({
      locator: "u",
      extraFlags: ["--allow-file-access-from-files"],
    })
    expect(args.at(-1)).toBe("--allow-file-access-from-files")
  })

  it("applies override prepend before the base and append after extras", () => {
    const args = composeWebChromiumArgs({
      locator: "u",
      extraFlags: ["--allow-file-access-from-files"],
      overrides: { prepend: ["--first"], append: ["--last"] },
    })
    expect(args.at(0)).toBe("--first")
    expect(args.at(-1)).toBe("--last")
    expect(args.indexOf("--allow-file-access-from-files")).toBeLessThan(
      args.indexOf("--last"),
    )
  })
})
