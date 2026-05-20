import { describe, expect, it } from "bun:test"
import {
  buildElectrobunCommand,
  classifyElectrobunBinaryOrigin,
  createElectrobunController,
  forbiddenElectrobunProductionEnv,
} from "./sessiond-electrobun"

describe("Electrobun renderer command", () => {
  it("builds a Device profile command with isolated state and sessiond launcher env", () => {
    const command = buildElectrobunCommand({
      executablePath: "korri-desktop-device",
      stateRoot: "/storage/app-state",
      statusFile: "/storage/app-state/status.json",
      sessiondUrl: "http://127.0.0.1:3003",
      sessiondTokenFile: "/storage/.guest/korri/sessiond.token",
      extraEnv: {
        XDG_DATA_HOME: "/xdg-data",
        KORRI_LIBRARY_ROOT: "/xdg-data/korri/library",
      },
    })

    expect(command).toMatchObject({
      command: "korri-desktop-device",
      args: [],
      env: {
        NODE: undefined,
        NODE_ENV: undefined,
        PATH: expect.not.stringContaining("/node_modules/.bin"),
        KORRI_DESKTOP_PROFILE: "device",
        KORRI_DEVICE_STATE_ROOT: "/xdg-data/korri",
        KORRI_LIBRARY_ROOT: "/xdg-data/korri/library",
        KORRI_DESKTOP_STATUS_FILE: "/storage/app-state/status.json",
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
        KORRI_SESSIOND_TOKEN_FILE: "/storage/.guest/korri/sessiond.token",
        XDG_DATA_HOME: "/storage/app-state/data",
        XDG_CONFIG_HOME: "/storage/app-state/config",
        XDG_CACHE_HOME: "/storage/app-state/cache",
        CHROME_CONFIG_HOME: "/storage/app-state/config",
      },
    })
  })

  it("preserves hardened child env when extra env tries to override it", () => {
    const command = buildElectrobunCommand({
      extraEnv: {
        HOME: "/home/test",
        NODE_ENV: "development",
        PATH: "/tmp/bun-node/bin:/custom/bin",
        KORRI_DESKTOP_PROFILE: "debug",
      },
    })

    expect(command.env.NODE_ENV).toBeUndefined()
    expect(command.env.PATH).not.toContain("/tmp/bun-node")
    expect(command.env.KORRI_DESKTOP_PROFILE).toBe("device")
    expect(command.env.KORRI_LIBRARY_ROOT).toBe(
      "/home/test/.local/share/korri/library",
    )
  })

  it("classifies Nix-managed binary origins", () => {
    expect(classifyElectrobunBinaryOrigin("/nix/store/hash/bin/app")).toBe(
      "nix",
    )
    expect(
      classifyElectrobunBinaryOrigin("/run/current-system/sw/bin/app"),
    ).toBe("nix")
    expect(classifyElectrobunBinaryOrigin("/usr/bin/app")).toBe("non-nix")
    expect(classifyElectrobunBinaryOrigin(undefined)).toBe("missing")
  })

  it("detects forbidden production fallback env", () => {
    expect(
      forbiddenElectrobunProductionEnv({
        GSK_RENDERER: "cairo",
        WEBKIT_DISABLE_COMPOSITING_MODE: "1",
        WEBKIT_DISABLE_DMABUF_RENDERER: "1",
      }),
    ).toEqual([
      "GSK_RENDERER=cairo",
      "WEBKIT_DISABLE_COMPOSITING_MODE=1",
      "WEBKIT_DISABLE_DMABUF_RENDERER=1",
    ])
  })
})

describe("Electrobun renderer controller", () => {
  it("launches only after resolving a Nix-managed app binary", async () => {
    const spawned: unknown[] = []
    const controller = createElectrobunController({
      config: { executablePath: "korri-desktop-device" },
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-desktop-device",
        spawn: async command => {
          spawned.push(command)
          return { pid: 123 }
        },
      },
    })

    await expect(controller.launch()).resolves.toMatchObject({
      pid: 123,
      command: { command: "/nix/store/hash/bin/korri-desktop-device" },
      metadata: {
        statusFile: expect.any(String),
        stateRoot: expect.any(String),
      },
    })
    expect(spawned).toHaveLength(1)
  })

  it("refuses to launch a non-Nix app binary", async () => {
    const controller = createElectrobunController({
      config: { executablePath: "/usr/bin/korri-desktop-device" },
      runner: {
        resolve: async () => "/usr/bin/korri-desktop-device",
        spawn: async () => ({ pid: 123 }),
      },
    })

    await expect(controller.launch()).rejects.toThrow("Nix-managed")
  })

  it("refuses production launches with GPU fallback flags", async () => {
    const controller = createElectrobunController({
      config: {
        extraEnv: { GSK_RENDERER: "cairo" },
      },
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-desktop-device",
        spawn: async () => ({ pid: 123 }),
      },
    })

    await expect(controller.launch()).rejects.toThrow("fallback flags")
  })

  it("stops by pid through the injected runner", async () => {
    const stopped: number[] = []
    const controller = createElectrobunController({
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-desktop-device",
        spawn: async () => ({ pid: 123 }),
        kill: async pid => {
          stopped.push(pid)
        },
      },
    })

    await controller.stop(456)

    expect(stopped).toEqual([456])
  })
})
