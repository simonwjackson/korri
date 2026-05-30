import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildElectrobunCommand,
  classifyElectrobunBinaryOrigin,
  createElectrobunController,
  defaultElectrobunStatusFile,
  forbiddenElectrobunProductionEnv,
  realElectrobunRunner,
} from "./sessiond-electrobun"

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

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

  it("derives the default status file from the Electrobun state root", () => {
    expect(defaultElectrobunStatusFile({ HOME: "/home/kiosk" })).toBe(
      "/home/kiosk/.local/state/korri/electrobun/status.json",
    )
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

  it("removes stale status files and waits for the renderer to write readiness", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-electrobun-"))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const statusFile = join(dir, "status.json")
    await writeFile(statusFile, "stale")
    const controller = createElectrobunController({
      config: {
        executablePath: "korri-desktop-device",
        statusFile,
        stateRoot: dir,
        readinessTimeoutMs: 500,
      },
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-desktop-device",
        spawn: async () => {
          // The controller unlinks stale status before spawn, then waits
          // for the newly-written status file to become non-empty.
          await writeFile(statusFile, '{"ready":true}\n')
          return { pid: 321 }
        },
      },
    })

    await expect(controller.launch()).resolves.toMatchObject({ pid: 321 })
    expect(await readFile(statusFile, "utf8")).toContain("ready")
  })

  it("times out when Electrobun never writes a status file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-electrobun-timeout-"))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const controller = createElectrobunController({
      config: {
        executablePath: "korri-desktop-device",
        statusFile: join(dir, "status.json"),
        stateRoot: dir,
        readinessTimeoutMs: 1,
      },
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-desktop-device",
        spawn: async () => ({ pid: 654 }),
      },
    })

    await expect(controller.launch()).rejects.toThrow(
      /did not write status file/,
    )
  })

  it("stop is a no-op when there is no renderer pid", async () => {
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

    await controller.stop(undefined)

    expect(stopped).toEqual([])
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

  it("realElectrobunRunner resolves absolute commands and PATH commands", async () => {
    expect(await realElectrobunRunner.resolve("/bin/true")).toBe("/bin/true")
    expect(await realElectrobunRunner.resolve("sh")).toBeString()
  })

  it("realElectrobunRunner appends spawn diagnostics to a log file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-electrobun-runner-"))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const logPath = join(dir, "electrobun.log")

    const trueCommand = await realElectrobunRunner.resolve("true")
    if (!trueCommand) throw new Error("expected true on PATH")
    const child = await realElectrobunRunner.spawn({
      command: trueCommand,
      args: [],
      env: {},
      logPath,
    })

    expect(child.pid).toBeGreaterThan(0)
    const log = await readFile(logPath, "utf8")
    expect(log).toContain("=== electrobun spawn at")
    expect(log).toContain("--- spawned child pid=")
  })

  it("realElectrobunRunner kill falls back from process group to child pid and swallows missing children", async () => {
    const originalKill = process.kill
    const calls: Array<{ readonly pid: number; readonly signal: string }> = []
    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      calls.push({ pid, signal: String(signal) })
      if (pid < 0) throw new Error("no process group")
      return true
    }) as typeof process.kill
    try {
      await realElectrobunRunner.kill?.(777)
      expect(calls).toEqual([
        { pid: -777, signal: "SIGTERM" },
        { pid: 777, signal: "SIGTERM" },
      ])
    } finally {
      process.kill = originalKill
    }

    process.kill = (() => {
      throw new Error("gone")
    }) as typeof process.kill
    try {
      await expect(realElectrobunRunner.kill?.(888)).resolves.toBeUndefined()
    } finally {
      process.kill = originalKill
    }
  })
})
