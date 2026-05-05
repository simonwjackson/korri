import { describe, expect, it } from "bun:test"
import {
  buildChromiumCommand,
  type ChromiumProfileFiles,
  createChromiumController,
  normalizeChromiumProfile,
} from "./sessiond-chromium"

function memoryFiles(
  initial: Record<string, string> = {},
): ChromiumProfileFiles & {
  readonly written: Map<string, string>
  readonly dirs: string[]
} {
  const written = new Map(Object.entries(initial))
  const dirs: string[] = []
  return {
    written,
    dirs,
    readText: async path => {
      const value = written.get(path)
      if (value === undefined) throw new Error(`missing ${path}`)
      return value
    },
    writeText: async (path, content) => {
      written.set(path, content)
    },
    ensureDir: async path => {
      dirs.push(path)
    },
  }
}

describe("chromium profile normalization", () => {
  it("rewrites crashed profile metadata to a clean normal exit", async () => {
    const files = memoryFiles({
      "/profile/Default/Preferences": JSON.stringify({
        profile: { exit_type: "Crashed", exited_cleanly: false },
        session: { restore_on_startup: 1 },
      }),
    })

    await normalizeChromiumProfile("/profile", files)

    const rawPrefs = files.written.get("/profile/Default/Preferences")
    expect(rawPrefs).toBeDefined()
    const prefs = JSON.parse(rawPrefs ?? "{}")
    expect(prefs.profile.exit_type).toBe("Normal")
    expect(prefs.profile.exited_cleanly).toBe(true)
    expect(prefs.session.restore_on_startup).toBe(0)
  })

  it("creates missing profile files instead of failing", async () => {
    const files = memoryFiles()

    await normalizeChromiumProfile("/profile", files)

    expect(files.written.has("/profile/Default/Preferences")).toBe(true)
    expect(files.written.has("/profile/Local State")).toBe(true)
  })
})

describe("chromium launch command", () => {
  it("builds a Korri app/kiosk command with a dedicated profile", () => {
    const command = buildChromiumCommand({
      executablePath: "/apps/chromium/AppRun",
      profileDir: "/storage/korri/chromium-profile",
      url: "http://127.0.0.1:3100",
      remoteDebuggingPort: 9333,
    })

    expect(command.command).toBe("/apps/chromium/AppRun")
    expect(command.args).toContain("--kiosk")
    expect(command.args).toContain("--start-fullscreen")
    expect(command.args).toContain("--disable-session-crashed-bubble")
    expect(command.args).toContain("--disable-restore-session-state")
    expect(command.args).toContain(
      "--user-data-dir=/storage/korri/chromium-profile",
    )
    expect(command.args).toContain("--remote-debugging-port=9333")
    expect(command.args).toContain("--app=http://127.0.0.1:3100")
  })

  it("normalizes the profile before spawning Chromium", async () => {
    const files = memoryFiles({
      "/profile/Default/Preferences": JSON.stringify({
        profile: { exit_type: "Crashed" },
      }),
    })
    const spawned: unknown[] = []
    const controller = createChromiumController({
      config: {
        executablePath: "/apps/chromium/AppRun",
        profileDir: "/profile",
      },
      files,
      runner: {
        spawn: async command => {
          spawned.push(command)
          return { pid: 123 }
        },
      },
    })

    const result = await controller.launch()

    expect(result.pid).toBe(123)
    expect(spawned).toHaveLength(1)
    const rawPrefs = files.written.get("/profile/Default/Preferences")
    expect(rawPrefs).toBeDefined()
    expect(JSON.parse(rawPrefs ?? "{}").profile.exit_type).toBe("Normal")
  })

  it("stops by pid through the injected runner", async () => {
    const killed: number[] = []
    const controller = createChromiumController({
      config: { profileDir: "/profile" },
      files: memoryFiles(),
      runner: {
        spawn: async () => ({ pid: 123 }),
        kill: async pid => {
          killed.push(pid)
        },
      },
    })

    await controller.stop(123)

    expect(killed).toEqual([123])
  })
})
