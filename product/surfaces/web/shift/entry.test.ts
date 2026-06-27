import { describe, expect, it } from "bun:test"
import { readDualScreenConfig } from "./entry"

function target(href: string): Window {
  return { location: new URL(href) } as unknown as Window
}

describe("readDualScreenConfig", () => {
  it("maps primary and companion screen URLs onto a shared channel", () => {
    expect(
      readDualScreenConfig(
        target("http://localhost/screen?role=primary&session=thor"),
      ),
    ).toEqual({
      role: "primary",
      channelName: "korri-dual-screen-session:thor",
    })

    expect(
      readDualScreenConfig(
        target("http://localhost/screen?role=companion&session=thor"),
      ),
    ).toEqual({
      role: "companion",
      channelName: "korri-dual-screen-session:thor",
    })
  })

  it("uses a deterministic default channel when no session is supplied", () => {
    expect(
      readDualScreenConfig(target("http://localhost/screen?role=primary")),
    ).toEqual({
      role: "primary",
      channelName: "korri-dual-screen-session:desktop-dual-screen",
    })
  })

  it("leaves normal Shift entries single-screen for missing or invalid roles", () => {
    expect(readDualScreenConfig(target("http://localhost/"))).toBeUndefined()
    expect(
      readDualScreenConfig(target("http://localhost/screen?role=unknown")),
    ).toBeUndefined()
  })
})
