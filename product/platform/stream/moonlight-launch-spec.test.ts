import { describe, expect, it } from "bun:test"
import {
  composeMoonlightGamescopeLaunchSpec,
  composeMoonlightStreamLaunchSpec,
} from "./moonlight-launch-spec"

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

  it("rejects a single resolution dimension", () => {
    expect(() =>
      composeMoonlightStreamLaunchSpec({
        facts: { host: "aka.local" },
        policy: { stream: { resolution: { width: 1280 } } },
      }),
    ).toThrow(/width and height/)
  })
})

describe("composeMoonlightGamescopeLaunchSpec", () => {
  it("wraps Moonlight with sibling Gamescope policy", () => {
    const spec = composeMoonlightGamescopeLaunchSpec({
      facts: { host: "aka.local" },
      gamescope: { enable: true, window: { exposeWayland: true } },
    })

    expect(spec.command).toBe("gamescope")
    const separatorIndex = spec.args.indexOf("--")
    expect(separatorIndex).toBeGreaterThan(-1)
    expect(spec.args.slice(separatorIndex)).toEqual([
      "--",
      "moonlight",
      "stream",
      "-app",
      "Korri Stream",
      "aka.local",
    ])
  })

  it("fails before wrapping wayland Moonlight without sibling Gamescope Wayland exposure", () => {
    expect(() =>
      composeMoonlightGamescopeLaunchSpec({
        facts: { host: "aka.local" },
        policy: { platform: { name: "wayland" } },
        gamescope: { enable: true, window: { exposeWayland: false } },
      }),
    ).toThrow(/exposeWayland/)
  })
})
