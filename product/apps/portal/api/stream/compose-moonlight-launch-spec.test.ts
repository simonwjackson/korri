import { afterEach, describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import {
  composeMoonlightLaunchSpec,
  moonlightHostFromControlUrl,
  resolveMoonlightLaunchInputDevice,
} from "./compose-moonlight-launch-spec"

const originalEnv = {
  command: process.env.KORRI_MOONLIGHT_COMMAND,
  platform: process.env.KORRI_MOONLIGHT_PLATFORM,
  mappingFile: process.env.KORRI_MOONLIGHT_MAPPING_FILE,
  inputDevice: process.env.KORRI_MOONLIGHT_INPUT_DEVICE,
  absoluteTouch: process.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH,
  absoluteTouchBounds: process.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH_BOUNDS,
  absoluteTouchRequireBounds:
    process.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH_REQUIRE_BOUNDS,
  autoWindowResize: process.env.KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE,
  requireInputPlumber: process.env.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER,
}

const FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")

afterEach(() => {
  setOptionalEnv("KORRI_MOONLIGHT_COMMAND", originalEnv.command)
  setOptionalEnv("KORRI_MOONLIGHT_PLATFORM", originalEnv.platform)
  setOptionalEnv("KORRI_MOONLIGHT_MAPPING_FILE", originalEnv.mappingFile)
  setOptionalEnv("KORRI_MOONLIGHT_INPUT_DEVICE", originalEnv.inputDevice)
  setOptionalEnv("KORRI_MOONLIGHT_ABSOLUTE_TOUCH", originalEnv.absoluteTouch)
  setOptionalEnv(
    "KORRI_MOONLIGHT_ABSOLUTE_TOUCH_BOUNDS",
    originalEnv.absoluteTouchBounds,
  )
  setOptionalEnv(
    "KORRI_MOONLIGHT_ABSOLUTE_TOUCH_REQUIRE_BOUNDS",
    originalEnv.absoluteTouchRequireBounds,
  )
  setOptionalEnv(
    "KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE",
    originalEnv.autoWindowResize,
  )
  setOptionalEnv(
    "KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER",
    originalEnv.requireInputPlumber,
  )
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

  it("allows explicit app/platform/mapping/input overrides", () => {
    process.env.KORRI_MOONLIGHT_PLATFORM = "v4l2m2m"
    process.env.KORRI_MOONLIGHT_MAPPING_FILE = "/nix/store/mapping.txt"
    process.env.KORRI_MOONLIGHT_INPUT_DEVICE = "/dev/input/event10"

    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      appName: "Desktop",
      platform: "x11",
      mappingFile: "/tmp/gamecontrollerdb.txt",
      inputDevice: "/dev/input/event8",
    })

    expect(spec.args).toEqual([
      "stream",
      "-platform",
      "x11",
      "-mapping",
      "/tmp/gamecontrollerdb.txt",
      "-input",
      "/dev/input/event8",
      "-app",
      "Desktop",
      "aka.local",
    ])
  })

  it("uses KORRI_MOONLIGHT_INPUT_DEVICE when set", () => {
    process.env.KORRI_MOONLIGHT_INPUT_DEVICE = "/dev/input/event8"

    const spec = composeMoonlightLaunchSpec({ host: "aka.local" })

    expect(spec.args).toEqual([
      "stream",
      "-input",
      "/dev/input/event8",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("adds fail-closed absolute touch mode for dynamic bounds", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      absoluteTouch: true,
      absoluteTouchRequireBounds: true,
    })

    expect(spec.args).toEqual([
      "stream",
      "-absolutetouch",
      "-absolutetouchrequirebounds",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("adds auto-window-resize when KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE is enabled", () => {
    process.env.KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE = "1"

    const spec = composeMoonlightLaunchSpec({ host: "aka.local" })

    expect(spec.args).toEqual([
      "stream",
      "-autowindowresize",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("uses KORRI_MOONLIGHT_ABSOLUTE_TOUCH_BOUNDS when set", () => {
    process.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH = "1"
    process.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH_BOUNDS = "0,0,1080,1920"

    const spec = composeMoonlightLaunchSpec({ host: "aka.local" })

    expect(spec.args).toEqual([
      "stream",
      "-absolutetouch",
      "-absolutetouchbounds",
      "0,0,1080,1920",
      "-app",
      "Korri Stream",
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

describe("resolveMoonlightLaunchInputDevice", () => {
  it("discovers the InputPlumber virtual controller by identity", async () => {
    const result = await resolveMoonlightLaunchInputDevice({
      requireInputPlumberInput: true,
      readProcDevices: () =>
        readFile(
          join(FIXTURES_DIR, "bus-input-devices-inputplumber-virtual.txt"),
          "utf8",
        ),
    })

    expect(result).toEqual({ status: "ok", path: "/dev/input/event10" })
  })

  it("fails closed when InputPlumber is required but missing", async () => {
    const result = await resolveMoonlightLaunchInputDevice({
      requireInputPlumberInput: true,
      readProcDevices: async () => "",
    })

    expect(result).toEqual({
      status: "failed",
      failureKind: "input-unavailable",
      message:
        "InputPlumber virtual controller is missing (0 raw gamepad candidates); refusing to launch Moonlight without mapped controller input",
    })
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
