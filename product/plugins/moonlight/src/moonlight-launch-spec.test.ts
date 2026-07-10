import { describe, expect, it } from "bun:test"
import { composeMoonlightStreamLaunchSpec } from "./moonlight-launch-spec"

describe("composeMoonlightStreamLaunchSpec", () => {
  it("renders the invariant moonlight stream action, Korri Stream app, and launch-time host", () => {
    expect(
      composeMoonlightStreamLaunchSpec({ facts: { host: "aka.local" } }),
    ).toEqual({
      command: "moonlight",
      args: ["stream", "-app", "Korri Stream", "aka.local"],
    })
  })

  it("renders command, typed Moonlight flags, structured touch bounds, env sets/unsets, and extra args", () => {
    const spec = composeMoonlightStreamLaunchSpec({
      facts: {
        host: "192.168.1.117",
        inputDevices: ["/dev/input/event10"],
        environment: { MOONLIGHT_LOCAL_CONTROL_SESSION_ID: "session-1" },
      },
      policy: {
        command: "/nix/store/moonlight/bin/moonlight",
        environment: {
          SDL_VIDEODRIVER: "wayland",
          OLD_MOONLIGHT_STATE_HOME: null,
        },
        logging: { verbose: true, debug: true },
        stream: {
          resolution: { width: 1280, height: 720 },
          fps: 60,
          bitrateKbps: 25_000,
          packetSizeBytes: 1024,
          codec: "h265",
          remoteOptimizations: true,
          unsupportedHost: true,
          quitAppAfter: true,
          noSops: true,
          localAudio: true,
          surround: true,
          keyDir: "/var/lib/moonlight/keys",
        },
        platform: { name: "sdl" },
        input: {
          devices: ["/dev/input/event8"],
          mappingFile: "/nix/store/gamecontrollerdb.txt",
          viewOnly: true,
          rotate: 90,
          touch: {
            absolute: true,
            requireBounds: true,
            bounds: { x: 0, y: 10, w: 1080, h: 1920 },
          },
        },
        audio: { device: "sysdefault" },
        window: { windowed: true, autoResize: true },
        extraArgs: ["-debugnote", "after-typed"],
      },
    })

    expect(spec.command).toBe("/nix/store/moonlight/bin/moonlight")
    expect(spec.env).toEqual({
      MOONLIGHT_LOCAL_CONTROL_SESSION_ID: "session-1",
      SDL_VIDEODRIVER: "wayland",
    })
    expect(spec.envUnset).toEqual(["OLD_MOONLIGHT_STATE_HOME"])
    expect(spec.args).toEqual([
      "stream",
      "-verbose",
      "-debug",
      "-width",
      "1280",
      "-height",
      "720",
      "-fps",
      "60",
      "-bitrate",
      "25000",
      "-packetsize",
      "1024",
      "-codec",
      "h265",
      "-remote",
      "-unsupported",
      "-quitappafter",
      "-nosops",
      "-localaudio",
      "-surround",
      "-keydir",
      "/var/lib/moonlight/keys",
      "-platform",
      "sdl",
      "-mapping",
      "/nix/store/gamecontrollerdb.txt",
      "-input",
      "/dev/input/event8",
      "-input",
      "/dev/input/event10",
      "-viewonly",
      "-rotate",
      "90",
      "-absolutetouch",
      "-absolutetouchrequirebounds",
      "-absolutetouchbounds",
      "0,10,1080,1920",
      "-audio",
      "sysdefault",
      "-windowed",
      "-autowindowresize",
      "-debugnote",
      "after-typed",
      "-app",
      "Korri Stream",
      "192.168.1.117",
    ])
  })

  it("renders launch-time start values from unified stream ranges", () => {
    const spec = composeMoonlightStreamLaunchSpec({
      facts: { host: "aka.local" },
      policy: {
        stream: {
          resolution: {
            min: { width: 640, height: 360 },
            start: { width: 1280, height: 720 },
            max: { width: 1920, height: 1080 },
          },
          fps: { min: 60, start: 120, max: 120 },
          bitrateKbps: { min: 500, start: 6000, max: 40000 },
        },
      },
    })

    expect(spec.args).toEqual([
      "stream",
      "-width",
      "1280",
      "-height",
      "720",
      "-fps",
      "120",
      "-bitrate",
      "6000",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("passes an IPv6 host through unchanged after caller bracket stripping", () => {
    expect(
      composeMoonlightStreamLaunchSpec({ facts: { host: "fe80::1234" } }).args,
    ).toEqual(["stream", "-app", "Korri Stream", "fe80::1234"])
  })

  it("rejects an empty host", () => {
    expect(() =>
      composeMoonlightStreamLaunchSpec({ facts: { host: "" } }),
    ).toThrow(/host/)
  })

  it("lets runtime facts win over policy env overlays for control keys", () => {
    const spec = composeMoonlightStreamLaunchSpec({
      facts: {
        host: "aka.local",
        environment: { MOONLIGHT_LOCAL_CONTROL_SOCKET: "/run/live.sock" },
      },
      policy: {
        environment: {
          MOONLIGHT_LOCAL_CONTROL_SOCKET: null,
          OLD_STATE: null,
        },
      },
    })

    expect(spec.env).toEqual({
      MOONLIGHT_LOCAL_CONTROL_SOCKET: "/run/live.sock",
    })
    expect(spec.envUnset).toEqual(["OLD_STATE"])
  })

  it("clears env when policy unsets every inherited env key", () => {
    const spec = composeMoonlightStreamLaunchSpec({
      facts: { host: "aka.local" },
      policy: { environment: { OLD_STATE: null } },
    })

    expect(spec.env).toBeUndefined()
    expect(spec.envUnset).toEqual(["OLD_STATE"])
  })

  it("rejects a single resolution dimension", () => {
    expect(() =>
      composeMoonlightStreamLaunchSpec({
        facts: { host: "aka.local" },
        policy: { stream: { resolution: { width: 1280 } } },
      }),
    ).toThrow(/width and height/)
  })
})
