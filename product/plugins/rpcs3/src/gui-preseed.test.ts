import { describe, expect, it } from "bun:test"
import { mergeGuiIni } from "./gui-preseed"

describe("mergeGuiIni", () => {
  it("writes suppression keys under their section into a fresh file", () => {
    const out = mergeGuiIni(undefined, [
      ["main_window", "confirmationBoxExitGame", false],
      ["main_window", "infoBoxEnabledWelcome", false],
    ])
    expect(out).toContain("[main_window]")
    expect(out).toContain("confirmationBoxExitGame=false")
    expect(out).toContain("infoBoxEnabledWelcome=false")
  })

  it("preserves unrelated sections and keys, updating only targeted keys", () => {
    const existing = [
      "[main_window]",
      "geometry=@ByteArray(abc)",
      "confirmationBoxExitGame=true",
      "",
      "[other]",
      "foo=bar",
      "",
    ].join("\n")

    const out = mergeGuiIni(existing, [
      ["main_window", "confirmationBoxExitGame", false],
    ])

    expect(out).toContain("geometry=@ByteArray(abc)")
    expect(out).toContain("confirmationBoxExitGame=false")
    expect(out).not.toContain("confirmationBoxExitGame=true")
    expect(out).toContain("[other]")
    expect(out).toContain("foo=bar")
  })

  it("creates a missing section for a targeted key", () => {
    const out = mergeGuiIni("[other]\nfoo=bar\n", [
      ["main_window", "confirmationBoxBootGame", false],
    ])
    expect(out).toContain("[other]")
    expect(out).toContain("foo=bar")
    expect(out).toContain("[main_window]")
    expect(out).toContain("confirmationBoxBootGame=false")
  })
})
