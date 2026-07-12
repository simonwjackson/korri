import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createPluginRegistry } from "@platform/plugin/registry"
import { moonlightPlugin } from "@product/plugins/moonlight"

import {
  composeMoonlightLaunchSpec,
  moonlightHostFromControlUrl,
  resolveMoonlightLaunchInputDevice,
} from "./compose-moonlight-launch-spec"

const FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")

// The exhaustive Moonlight arg-composition coverage lives in the plugin
// (product/plugins/moonlight/src/moonlight-launch-spec.test.ts). Here we verify
// the portal wrapper dispatches the streamer capability through the registry
// and surfaces the composed spec / fails closed.
const streamRegistry = createPluginRegistry([moonlightPlugin], {
  enabledPluginIds: [moonlightPlugin.id],
})
const emptyRegistry = createPluginRegistry([], {})

describe("composeMoonlightLaunchSpec", () => {
  it("dispatches the streamer capability and returns the composed spec", async () => {
    const spec = await composeMoonlightLaunchSpec({
      host: "aka.local",
      registry: streamRegistry,
      inputDevices: ["/dev/input/event8"],
      moonlight: { platform: { name: "sdl" } },
    })

    expect(spec).toEqual({
      command: "moonlight",
      args: [
        "stream",
        "-platform",
        "sdl",
        "-input",
        "/dev/input/event8",
        "-app",
        "Korri Stream",
        "aka.local",
      ],
      // Korri always disables Moonlight's built-in gamepad quit combo.
      env: { KORRI_MOONLIGHT_DISABLE_GAMEPAD_QUIT: "1" },
    })
  })

  it("fails closed when no streamer plugin is enabled", async () => {
    await expect(
      composeMoonlightLaunchSpec({
        host: "aka.local",
        registry: emptyRegistry,
      }),
    ).rejects.toThrow(/streamer capability/)
  })

  it("always sets the gamepad-quit-disable env; caller env wins on collision", async () => {
    const spec = await composeMoonlightLaunchSpec({
      host: "aka.local",
      registry: streamRegistry,
      environment: { MOONLIGHT_LOCAL_CONTROL_SOCKET: "/run/m.sock" },
      moonlight: {
        environment: {
          SDL_AUDIODRIVER: "pipewire",
          OLD_MOONLIGHT_STATE_HOME: null,
        },
      },
    })

    expect(spec.env).toEqual({
      KORRI_MOONLIGHT_DISABLE_GAMEPAD_QUIT: "1",
      MOONLIGHT_LOCAL_CONTROL_SOCKET: "/run/m.sock",
      SDL_AUDIODRIVER: "pipewire",
    })
    expect(spec.envUnset).toEqual(["OLD_MOONLIGHT_STATE_HOME"])
  })

  it("rejects an empty host through the streamer handler", async () => {
    await expect(
      composeMoonlightLaunchSpec({ host: "", registry: streamRegistry }),
    ).rejects.toThrow(/host/i)
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
