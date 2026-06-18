import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import {
  composeMoonlightLaunchSpec,
  moonlightHostFromControlUrl,
  resolveMoonlightLaunchInputDevice,
} from "./compose-moonlight-launch-spec"

const FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")

describe("composeMoonlightLaunchSpec", () => {
  it("returns a bare Moonlight LaunchSpec; companion wrapping happens through plugin dispatch", () => {
    const spec = composeMoonlightLaunchSpec({ host: "aka.local" })

    expect(spec).toEqual({
      command: "moonlight",
      args: ["stream", "-app", "Korri Stream", "aka.local"],
    })
  })

  it("uses typed Moonlight policy rather than KORRI_MOONLIGHT_* env fallbacks", () => {
    process.env.KORRI_MOONLIGHT_COMMAND = "/ignored/moonlight"
    process.env.KORRI_MOONLIGHT_PLATFORM = "ignored"
    process.env.KORRI_MOONLIGHT_MAPPING_FILE = "/ignored/mapping.txt"

    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      moonlight: {
        command: "/run/current-system/sw/bin/moonlight",
        platform: { name: "sdl" },
        input: {
          mappingFile: "/nix/store/mapping.txt",
          touch: {
            absolute: true,
            requireBounds: true,
            bounds: { x: 0, y: 0, w: 1080, h: 1920 },
          },
        },
        window: { autoResize: true },
      },
    })

    expect(spec.command).toBe("/run/current-system/sw/bin/moonlight")
    expect(spec.args).toEqual([
      "stream",
      "-platform",
      "sdl",
      "-mapping",
      "/nix/store/mapping.txt",
      "-absolutetouch",
      "-absolutetouchrequirebounds",
      "-absolutetouchbounds",
      "0,0,1080,1920",
      "-autowindowresize",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("passes resolved input devices from caller preflight", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      inputDevices: ["/dev/input/event8"],
    })

    expect(spec.args).toEqual([
      "stream",
      "-input",
      "/dev/input/event8",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("maps nullable policy environment to env and envUnset", () => {
    const spec = composeMoonlightLaunchSpec({
      host: "aka.local",
      environment: { MOONLIGHT_LOCAL_CONTROL_SOCKET: "/run/m.sock" },
      moonlight: {
        environment: {
          SDL_AUDIODRIVER: "pipewire",
          OLD_MOONLIGHT_STATE_HOME: null,
        },
      },
    })

    expect(spec.env).toEqual({
      MOONLIGHT_LOCAL_CONTROL_SOCKET: "/run/m.sock",
      SDL_AUDIODRIVER: "pipewire",
    })
    expect(spec.envUnset).toEqual(["OLD_MOONLIGHT_STATE_HOME"])
  })

  it("passes IPv6 host through unchanged (caller is responsible for bracket-stripping)", () => {
    const spec = composeMoonlightLaunchSpec({ host: "::1" })
    expect(spec.args).toEqual(["stream", "-app", "Korri Stream", "::1"])
  })

  it("throws when host is empty", () => {
    expect(() => composeMoonlightLaunchSpec({ host: "" })).toThrow(/host/i)
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

  it("returns an explicit input path without reading proc devices", async () => {
    const result = await resolveMoonlightLaunchInputDevice({
      inputDevice: " /dev/input/event8 ",
      requireInputPlumberInput: true,
      readProcDevices: async () => {
        throw new Error("should not read proc devices for explicit input")
      },
    })

    expect(result).toEqual({ status: "ok", path: "/dev/input/event8" })
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

  it("fails closed when InputPlumber is ambiguous", async () => {
    const result = await resolveMoonlightLaunchInputDevice({
      requireInputPlumberInput: true,
      readProcDevices: () =>
        readFile(
          join(FIXTURES_DIR, "bus-input-devices-inputplumber-ambiguous.txt"),
          "utf8",
        ),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.failureKind).toBe("input-ambiguous")
      expect(result.message).toContain("ambiguous")
    }
  })
})

describe("moonlightHostFromControlUrl", () => {
  it("extracts hostnames", () => {
    expect(moonlightHostFromControlUrl("http://aka.local:3001")).toBe(
      "aka.local",
    )
  })

  it("strips IPv6 brackets", () => {
    expect(moonlightHostFromControlUrl("http://[fe80::1234]:3001")).toBe(
      "fe80::1234",
    )
  })

  it("rejects invalid URLs", () => {
    expect(() => moonlightHostFromControlUrl("not a url")).toThrow(/invalid/)
  })
})
