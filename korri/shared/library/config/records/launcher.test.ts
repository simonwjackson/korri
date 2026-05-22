import { describe, expect, it } from "bun:test"

import { decodeLauncherPayload } from "./launcher"

describe("LauncherPayload", () => {
  it("decodes a minimal launcher (command, args, systems)", () => {
    const launcher = decodeLauncherPayload({
      command: "/usr/bin/runemu.sh",
      args: ["{contentPath}", "-P{system}"],
      systems: ["snes"],
    })
    expect(launcher.command).toBe("/usr/bin/runemu.sh")
    expect(launcher.args).toEqual(["{contentPath}", "-P{system}"])
    expect(launcher.systems).toEqual(["snes"])
  })

  it("decodes a launcher supporting multiple systems", () => {
    const launcher = decodeLauncherPayload({
      command: "/usr/bin/retroarch",
      args: ["-L", "{core}", "{contentPath}"],
      systems: ["snes", "psx", "n64"],
    })
    expect(launcher.systems).toEqual(["snes", "psx", "n64"])
  })

  it("decodes inheritable layer fields + presets + byLauncher + inherit", () => {
    const launcher = decodeLauncherPayload({
      command: "/usr/bin/retroarch",
      args: [],
      systems: ["snes"],
      env: { LIBRETRO_LOG_LEVEL: "3" },
      argsAppend: ["--verbose"],
      gamescope: { enabled: true },
      cwd: "/storage",
      presets: { "max-quality": { gamescope: { args: ["-W", "1920"] } } },
      byLauncher: {},
      inherit: false,
    })
    expect(launcher.env?.LIBRETRO_LOG_LEVEL).toBe("3")
    expect(launcher.presets?.["max-quality"]?.gamescope?.args).toEqual([
      "-W",
      "1920",
    ])
    expect(launcher.inherit).toBe(false)
  })

  it("rejects an empty command", () => {
    expect(() =>
      decodeLauncherPayload({ command: "", args: [], systems: ["snes"] }),
    ).toThrow()
  })

  it("rejects a launcher missing 'systems'", () => {
    expect(() => decodeLauncherPayload({ command: "/x", args: [] })).toThrow()
  })

  it("rejects identity-field bypass: 'system' is not allowed on launcher", () => {
    expect(() =>
      decodeLauncherPayload({
        command: "/x",
        args: [],
        systems: ["snes"],
        system: "snes",
      }),
    ).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() =>
      decodeLauncherPayload({
        command: "/x",
        args: [],
        systems: ["snes"],
        emualtor: "retroarch",
      }),
    ).toThrow()
  })
})
