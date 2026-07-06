import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildChromiumCommand,
  classifyChromiumBinaryOrigin,
  createChromiumController,
  defaultChromiumStatusFile,
  realChromiumRunner,
} from "./sessiond-chromium"

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe("Chromium renderer command", () => {
  it("builds a Wayland app-mode command with isolated state and the host URL", () => {
    const command = buildChromiumCommand({
      executablePath: "korri-chromium-kiosk",
      hostUrl: "http://127.0.0.1:8099/",
      stateRoot: "/storage/app-state",
      statusFile: "/storage/app-state/status.json",
      extraEnv: {
        PATH: "/tmp/bun-node/bin:/custom/bin",
        NODE_ENV: "development",
      },
    })

    expect(command.command).toBe("korri-chromium-kiosk")
    expect(command.args).toEqual(
      expect.arrayContaining([
        "--ozone-platform=wayland",
        "--app=http://127.0.0.1:8099/",
        "--kiosk",
        "--user-data-dir=/storage/app-state/profile",
        "--no-first-run",
        "--noerrdialogs",
        "--disable-infobars",
        "--disable-session-crashed-bubble",
      ]),
    )
    expect(command.env).toMatchObject({
      NODE: undefined,
      NODE_ENV: undefined,
      KORRI_WEB_SURFACE_URL: "http://127.0.0.1:8099/",
      KORRI_DESKTOP_STATUS_FILE: "/storage/app-state/status.json",
      XDG_DATA_HOME: "/storage/app-state/data",
      XDG_CONFIG_HOME: "/storage/app-state/config",
      XDG_CACHE_HOME: "/storage/app-state/cache",
    })
    expect(command.env.PATH).not.toContain("/tmp/bun-node")
  })

  it("classifies Nix-managed binary origins", () => {
    expect(classifyChromiumBinaryOrigin("/nix/store/hash/bin/app")).toBe("nix")
    expect(classifyChromiumBinaryOrigin("/run/current-system/sw/bin/app")).toBe(
      "nix",
    )
    expect(classifyChromiumBinaryOrigin("/usr/bin/app")).toBe("non-nix")
    expect(classifyChromiumBinaryOrigin(undefined)).toBe("missing")
  })

  it("derives the default status file from the Chromium state root", () => {
    expect(defaultChromiumStatusFile({ HOME: "/home/kiosk" })).toBe(
      "/home/kiosk/.local/state/korri/chromium/status.json",
    )
  })
})

describe("Chromium renderer controller", () => {
  it("launches only after resolving a Nix-managed app binary", async () => {
    const spawned: unknown[] = []
    const controller = createChromiumController({
      config: { executablePath: "korri-chromium-kiosk" },
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-chromium-kiosk",
        spawn: async command => {
          spawned.push(command)
          return { pid: 123 }
        },
      },
    })

    await expect(controller.launch()).resolves.toMatchObject({
      pid: 123,
      command: { command: "/nix/store/hash/bin/korri-chromium-kiosk" },
      metadata: {
        statusFile: expect.any(String),
        stateRoot: expect.any(String),
        hostUrl: "http://127.0.0.1:8099/",
      },
    })
    expect(spawned).toHaveLength(1)
  })

  it("refuses to launch a non-Nix app binary", async () => {
    const controller = createChromiumController({
      config: { executablePath: "/usr/bin/chromium" },
      runner: {
        resolve: async () => "/usr/bin/chromium",
        spawn: async () => ({ pid: 123 }),
      },
    })

    await expect(controller.launch()).rejects.toThrow("Nix-managed")
  })

  it("removes stale status files and waits for the host readiness beacon", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-chromium-"))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const statusFile = join(dir, "status.json")
    await writeFile(statusFile, "stale")
    const controller = createChromiumController({
      config: {
        executablePath: "korri-chromium-kiosk",
        statusFile,
        stateRoot: dir,
        readinessTimeoutMs: 500,
      },
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-chromium-kiosk",
        spawn: async () => {
          await writeFile(statusFile, '{"ready":true}\n')
          return { pid: 321 }
        },
      },
    })

    await expect(controller.launch()).resolves.toMatchObject({ pid: 321 })
    expect(await readFile(statusFile, "utf8")).toContain("ready")
  })

  it("cleans up and times out when no readiness beacon writes the status file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-chromium-timeout-"))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const killed: number[] = []
    const controller = createChromiumController({
      config: {
        executablePath: "korri-chromium-kiosk",
        statusFile: join(dir, "status.json"),
        stateRoot: dir,
        readinessTimeoutMs: 1,
      },
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-chromium-kiosk",
        spawn: async () => ({ pid: 654 }),
        kill: async pid => {
          killed.push(pid)
        },
      },
    })

    await expect(controller.launch()).rejects.toThrow(/did not become ready/)
    expect(killed).toEqual([654])
  })

  it("stop is a no-op without a renderer pid and kills by pid when present", async () => {
    const stopped: number[] = []
    const controller = createChromiumController({
      runner: {
        resolve: async () => "/nix/store/hash/bin/korri-chromium-kiosk",
        spawn: async () => ({ pid: 123 }),
        kill: async pid => {
          stopped.push(pid)
        },
      },
    })

    await controller.stop(undefined)
    await controller.stop(456)

    expect(stopped).toEqual([456])
  })

  it("realChromiumRunner resolves absolute commands and PATH commands", async () => {
    expect(await realChromiumRunner.resolve("/bin/true")).toBe("/bin/true")
    expect(await realChromiumRunner.resolve("sh")).toBeString()
  })
})
