import { describe, expect, it } from "bun:test"

import { decodeEphemeralOverride } from "./ephemeral-override"

describe("EphemeralOverride", () => {
  it("decodes an empty override (zero opinions)", () => {
    const override = decodeEphemeralOverride({})
    expect(override).toEqual({})
  })

  it("decodes a launcher switch", () => {
    const override = decodeEphemeralOverride({ launcher: "snes9x" })
    expect(override.launcher).toBe("snes9x")
  })

  it("decodes inheritable behavior contributions", () => {
    const override = decodeEphemeralOverride({
      gamescope: {
        enable: true,
        backend: { type: "wayland" },
        scaling: { filter: "fsr" },
        window: { exposeWayland: true },
      },
      moonlight: {
        stream: { fps: 60 },
        platform: { name: "sdl" },
        control: { enable: true, authority: "controller" },
      },
      env: { SDL_VIDEODRIVER: "wayland" },
      cwd: "/storage/roms",
      argsAppend: ["--debug"],
      patches: ["/patches/override.ips"],
    })
    expect(override.gamescope?.enable).toBe(true)
    expect(override.moonlight?.platform?.name).toBe("sdl")
    expect(override.env?.SDL_VIDEODRIVER).toBe("wayland")
    expect(override.patches).toEqual(["/patches/override.ips"])
  })

  it("decodes byLauncher contributions + inherit including safe gamescope fields", () => {
    const override = decodeEphemeralOverride({
      byLauncher: {
        retroarch: {
          gamescope: { enable: false, scaling: { filter: "nearest" } },
          argsAppend: ["-v"],
          patches: ["/patches/retroarch.ips"],
        },
      },
      inherit: false,
    })
    expect(override.byLauncher?.retroarch?.gamescope?.enable).toBe(false)
    expect(override.byLauncher?.retroarch?.gamescope?.scaling?.filter).toBe(
      "nearest",
    )
    expect(override.byLauncher?.retroarch?.argsAppend).toEqual(["-v"])
    expect(override.byLauncher?.retroarch?.patches).toEqual([
      "/patches/retroarch.ips",
    ])
    expect(override.inherit).toBe(false)
  })

  it("rejects identity-field bypass: 'system' is not allowed", () => {
    expect(() => decodeEphemeralOverride({ system: "snes" })).toThrow()
  })

  it("rejects identity-field bypass: 'contentPath' is not allowed", () => {
    expect(() =>
      decodeEphemeralOverride({ contentPath: "/storage/roms/x.smc" }),
    ).toThrow()
  })

  it("rejects 'name' / 'description' (those belong to presets, not overrides)", () => {
    expect(() => decodeEphemeralOverride({ name: "My Override" })).toThrow()
  })

  it("rejects 'presets' (overrides don't carry nested presets)", () => {
    expect(() => decodeEphemeralOverride({ presets: { x: {} } })).toThrow()
  })

  it("rejects RetroArch policy overrides until a safe authenticated subset is designed", () => {
    expect(() =>
      decodeEphemeralOverride({
        retroarch: { video: { aspectRatio: "full" } },
      }),
    ).toThrow()
    expect(() =>
      decodeEphemeralOverride({
        byLauncher: {
          retroarch: { retroarch: { video: { aspectRatio: "full" } } },
        },
      }),
    ).toThrow()
  })

  it("rejects Gamescope process, env, raw argv, and path surfaces in runtime overrides", () => {
    for (const gamescope of [
      { command: "/bin/gamescope" },
      { environment: { LD_PRELOAD: "/tmp/inject.so" } },
      { app: { environment: { PATH: "/tmp" } } },
      { extraArgs: ["--unsafe"] },
      { stats: { path: "/tmp/stats" } },
      { cursor: { image: "/tmp/cursor.png" } },
      { reshade: { effect: "/tmp/effect.fx" } },
      { scheduling: { readyFd: 3 } },
    ]) {
      expect(() => decodeEphemeralOverride({ gamescope })).toThrow()
    }
  })

  it("rejects unsafe Gamescope surfaces inside byLauncher overrides", () => {
    expect(() =>
      decodeEphemeralOverride({
        byLauncher: {
          retroarch: { gamescope: { command: "/bin/gamescope" } },
        },
      }),
    ).toThrow()
  })

  it("rejects Moonlight process and shell surfaces in runtime overrides", () => {
    for (const moonlight of [
      { command: "/bin/moonlight" },
      { environment: { LD_PRELOAD: "/tmp/inject.so" } },
      { extraArgs: ["-unsafe"] },
      { stream: { keyDir: "/tmp/keys" } },
      { control: { allowRootPeers: true } },
    ]) {
      expect(() => decodeEphemeralOverride({ moonlight })).toThrow()
    }
  })

  it("rejects unsafe Moonlight surfaces inside byLauncher overrides", () => {
    expect(() =>
      decodeEphemeralOverride({
        byLauncher: {
          moonlight: { moonlight: { command: "/bin/moonlight" } },
        },
      }),
    ).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() =>
      decodeEphemeralOverride({ gamescpoe: { enable: true } }),
    ).toThrow()
  })
})
