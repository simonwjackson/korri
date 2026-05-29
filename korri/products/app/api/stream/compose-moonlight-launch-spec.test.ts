import { afterEach, describe, expect, it } from "bun:test"

import {
  composeMoonlightLaunchSpec,
  moonlightHostFromControlUrl,
} from "./compose-moonlight-launch-spec"

const originalEnv = {
  command: process.env.KORRI_MOONLIGHT_COMMAND,
  platform: process.env.KORRI_MOONLIGHT_PLATFORM,
  mappingFile: process.env.KORRI_MOONLIGHT_MAPPING_FILE,
}

afterEach(() => {
  setOptionalEnv("KORRI_MOONLIGHT_COMMAND", originalEnv.command)
  setOptionalEnv("KORRI_MOONLIGHT_PLATFORM", originalEnv.platform)
  setOptionalEnv("KORRI_MOONLIGHT_MAPPING_FILE", originalEnv.mappingFile)
})

describe("composeMoonlightLaunchSpec", () => {
  it("wraps the stable Korri Stream moonlight app in gamescope when enabled", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "192.168.1.10",
      gamescope: { enabled: true },
    })

    expect(spec.command).toBe("gamescope")
    // gamescope flags then -- then moonlight stream -app "Korri Stream" <host>
    expect(spec.args).toContain("--")
    const separatorIndex = spec.args.indexOf("--")
    expect(spec.args.slice(separatorIndex)).toEqual([
      "--",
      "moonlight",
      "stream",
      "-app",
      "Korri Stream",
      "192.168.1.10",
    ])
  })

  it("returns a bare moonlight LaunchSpec when gamescope is disabled", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      gamescope: { enabled: false },
    })

    expect(spec).toEqual({
      command: "moonlight",
      args: ["stream", "-app", "Korri Stream", "aka.local"],
    })
  })

  it("defaults to gamescope-disabled when no gamescope policy is provided", () => {
    const spec = composeMoonlightLaunchSpec({ host: "aka.local" })

    expect(spec).toEqual({
      command: "moonlight",
      args: ["stream", "-app", "Korri Stream", "aka.local"],
    })
  })

  it("uses KORRI_MOONLIGHT_COMMAND when set", () => {
    process.env.KORRI_MOONLIGHT_COMMAND = "/run/current-system/sw/bin/moonlight"
    const spec = composeMoonlightLaunchSpec({ host: "aka.local" })
    expect(spec.command).toBe("/run/current-system/sw/bin/moonlight")
    expect(spec.args).toEqual(["stream", "-app", "Korri Stream", "aka.local"])
  })

  it("uses KORRI_MOONLIGHT_PLATFORM and KORRI_MOONLIGHT_MAPPING_FILE when set", () => {
    process.env.KORRI_MOONLIGHT_PLATFORM = "v4l2m2m"
    process.env.KORRI_MOONLIGHT_MAPPING_FILE = "/nix/store/mapping.txt"

    const spec = composeMoonlightLaunchSpec({ host: "aka.local" })

    expect(spec.args).toEqual([
      "stream",
      "-platform",
      "v4l2m2m",
      "-mapping",
      "/nix/store/mapping.txt",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("allows explicit app/platform/mapping overrides", () => {
    process.env.KORRI_MOONLIGHT_PLATFORM = "v4l2m2m"
    process.env.KORRI_MOONLIGHT_MAPPING_FILE = "/nix/store/mapping.txt"

    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      appName: "Desktop",
      platform: "x11",
      mappingFile: "/tmp/gamecontrollerdb.txt",
    })

    expect(spec.args).toEqual([
      "stream",
      "-platform",
      "x11",
      "-mapping",
      "/tmp/gamecontrollerdb.txt",
      "-app",
      "Desktop",
      "aka.local",
    ])
  })

  it("passes IPv6 host through unchanged (caller is responsible for bracket-stripping)", () => {
    const spec = composeMoonlightLaunchSpec({ host: "::1" })
    expect(spec.args).toEqual(["stream", "-app", "Korri Stream", "::1"])
  })

  it("throws when host is empty", () => {
    expect(() => composeMoonlightLaunchSpec({ host: "" })).toThrow(/host/i)
  })

  it("throws when appName is empty", () => {
    expect(() =>
      composeMoonlightLaunchSpec({ host: "aka.local", appName: "" }),
    ).toThrow(/appName/i)
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

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
