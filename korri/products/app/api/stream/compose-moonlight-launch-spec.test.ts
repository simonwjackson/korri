import { afterEach, describe, expect, it } from "bun:test"

import {
  composeMoonlightLaunchSpec,
  moonlightHostFromControlUrl,
} from "./compose-moonlight-launch-spec"

const originalCommand = process.env.KORRI_MOONLIGHT_COMMAND

afterEach(() => {
  if (originalCommand === undefined) delete process.env.KORRI_MOONLIGHT_COMMAND
  else process.env.KORRI_MOONLIGHT_COMMAND = originalCommand
})

describe("composeMoonlightLaunchSpec", () => {
  it("wraps moonlight stream <host> <gameId> in gamescope when enabled", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "192.168.1.10",
      gameId: "abc123",
      gamescope: { enabled: true },
    })

    expect(spec.command).toBe("gamescope")
    // gamescope flags then -- then moonlight stream <host> <gameId>
    expect(spec.args).toContain("--")
    const separatorIndex = spec.args.indexOf("--")
    expect(spec.args.slice(separatorIndex)).toEqual([
      "--",
      "moonlight",
      "stream",
      "192.168.1.10",
      "abc123",
    ])
  })

  it("returns a bare moonlight LaunchSpec when gamescope is disabled", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      gameId: "abc123",
      gamescope: { enabled: false },
    })

    expect(spec).toEqual({
      command: "moonlight",
      args: ["stream", "aka.local", "abc123"],
    })
  })

  it("defaults to gamescope-disabled when no gamescope policy is provided", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      gameId: "abc123",
    })

    expect(spec).toEqual({
      command: "moonlight",
      args: ["stream", "aka.local", "abc123"],
    })
  })

  it("uses KORRI_MOONLIGHT_COMMAND when set", () => {
    process.env.KORRI_MOONLIGHT_COMMAND = "/run/current-system/sw/bin/moonlight"
    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      gameId: "abc123",
    })
    expect(spec.command).toBe("/run/current-system/sw/bin/moonlight")
    expect(spec.args).toEqual(["stream", "aka.local", "abc123"])
  })

  it("passes IPv6 host through unchanged (caller is responsible for bracket-stripping)", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "::1",
      gameId: "abc123",
    })
    expect(spec.args).toEqual(["stream", "::1", "abc123"])
  })

  it("throws when host is empty", () => {
    expect(() =>
      composeMoonlightLaunchSpec({ host: "", gameId: "abc123" }),
    ).toThrow(/host/i)
  })

  it("throws when gameId is empty", () => {
    expect(() =>
      composeMoonlightLaunchSpec({ host: "aka.local", gameId: "" }),
    ).toThrow(/gameId/i)
  })
})

describe("moonlightHostFromControlUrl", () => {
  it("extracts the hostname from a normal http control URL", () => {
    expect(moonlightHostFromControlUrl("http://192.168.1.10:3001")).toBe(
      "192.168.1.10",
    )
  })

  it("extracts the hostname from a https control URL", () => {
    expect(moonlightHostFromControlUrl("https://aka.local:3001/")).toBe(
      "aka.local",
    )
  })

  it("strips IPv6 brackets", () => {
    expect(moonlightHostFromControlUrl("http://[::1]:3001")).toBe("::1")
    expect(moonlightHostFromControlUrl("http://[fe80::1234]:3001")).toBe(
      "fe80::1234",
    )
  })

  it("throws on a malformed URL", () => {
    expect(() => moonlightHostFromControlUrl("not a url")).toThrow(
      /controlUrl/i,
    )
  })

  it("throws on an empty string", () => {
    expect(() => moonlightHostFromControlUrl("")).toThrow(/controlUrl/i)
  })
})
