import { describe, expect, it } from "bun:test"
import {
  buildElectrobunCommand,
  classifyElectrobunBinaryOrigin,
  createElectrobunController,
  forbiddenElectrobunProductionEnv,
} from "./sessiond-electrobun"

describe("Electrobun renderer command", () => {
  it("builds an Odin profile command with isolated state and sessiond launcher env", () => {
    const command = buildElectrobunCommand({
      executablePath: "korri-desktop-odin",
      stateRoot: "/storage/app-state",
      statusFile: "/storage/app-state/status.json",
      sessiondUrl: "http://127.0.0.1:3003",
      sessiondTokenFile: "/storage/korri/sessiond.token",
    })

    expect(command).toMatchObject({
      command: "korri-desktop-odin",
      args: [],
      env: {
        NODE: undefined,
        NODE_ENV: "production",
        PATH: expect.not.stringContaining("/node_modules/.bin"),
        KORRI_DESKTOP_PROFILE: "odin",
        KORRI_DESKTOP_STATUS_FILE: "/storage/app-state/status.json",
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
        KORRI_SESSIOND_TOKEN_FILE: "/storage/korri/sessiond.token",
        XDG_DATA_HOME: "/storage/app-state/data",
        XDG_CONFIG_HOME: "/storage/app-state/config",
        XDG_CACHE_HOME: "/storage/app-state/cache",
        CHROME_CONFIG_HOME: "/storage/app-state/config",
      },
    })
  })

  it("classifies Nix-managed binary origins", () => {
    expect(classifyElectrobunBinaryOrigin("/nix/store/hash/bin/app")).toBe(
      "nix",
    )
    expect(
      classifyElectrobunBinaryOrigin("/storage/.nix-profile/bin/app"),
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
      config: { executablePath: "korri-desktop-odin" },
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-desktop-odin",
        spawn: async command => {
          spawned.push(command)
          return { pid: 123 }
        },
      },
    })

    await expect(controller.launch()).resolves.toMatchObject({
      pid: 123,
      command: { command: "/nix/store/hash/bin/korri-desktop-odin" },
      metadata: {
        statusFile: expect.any(String),
        stateRoot: expect.any(String),
      },
    })
    expect(spawned).toHaveLength(1)
  })

  it("refuses to launch a non-Nix app binary", async () => {
    const controller = createElectrobunController({
      config: { executablePath: "/usr/bin/korri-desktop-odin" },
      runner: {
        resolve: async () => "/usr/bin/korri-desktop-odin",
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
        resolve: async () => "/nix/store/hash/bin/korri-desktop-odin",
        spawn: async () => ({ pid: 123 }),
      },
    })

    await expect(controller.launch()).rejects.toThrow("fallback flags")
  })

  it("stops by pid through the injected runner", async () => {
    const stopped: number[] = []
    const controller = createElectrobunController({
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-desktop-odin",
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
