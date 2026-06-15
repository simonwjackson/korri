import { afterEach, describe, expect, it } from "bun:test"
import {
  appendFile,
  mkdir,
  mkdtemp,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createSteamLogTailer,
  type TailedSteamLogLine,
} from "./steam-log-tailer"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

async function tempLogDir() {
  const dir = await mkdtemp(join(tmpdir(), "korri-steam-tailer-"))
  tempDirs.push(dir)
  return dir
}

describe("Steam log tailer", () => {
  it("starts existing watched files at EOF and emits only appended lines", async () => {
    const dir = await tempLogDir()
    await writeFile(join(dir, "content_log.txt"), "old\n")
    const lines: TailedSteamLogLine[] = []
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["content_log.txt"],
      onLine: line => lines.push(line),
      watch: false,
      now: () => "2026-06-14T18:00:00.000Z",
    })

    await tailer.start()
    await tailer.scanOnce()
    await appendFile(join(dir, "content_log.txt"), "new one\nnew two\n")
    await tailer.scanOnce()

    expect(lines.map(line => line.line)).toEqual(["new one", "new two"])
    expect(lines.map(line => line.sequence)).toEqual([1, 2])
    expect(lines[0]).toMatchObject({
      source: "content_log",
      logFile: "content_log.txt",
    })
    await tailer.stop()
  })

  it("begins tailing a watched file when it appears after startup", async () => {
    const dir = await tempLogDir()
    const lines: TailedSteamLogLine[] = []
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["gameprocess_log.txt"],
      onLine: line => lines.push(line),
      watch: false,
    })

    await tailer.start()
    await tailer.scanOnce()
    await writeFile(join(dir, "gameprocess_log.txt"), "first\n")
    await tailer.scanOnce()

    expect(lines.map(line => line.line)).toEqual(["first"])
    await tailer.stop()
  })

  it("resets offset after truncation and after recreation by name", async () => {
    const dir = await tempLogDir()
    const file = join(dir, "console_log.txt")
    await writeFile(file, "history\n")
    const lines: TailedSteamLogLine[] = []
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["console_log.txt"],
      onLine: line => lines.push(line),
      watch: false,
    })

    await tailer.start()
    await writeFile(file, "new\n")
    await tailer.scanOnce()
    await unlink(file)
    await writeFile(file, "recreated\n")
    await tailer.scanOnce()

    expect(lines.map(line => line.line)).toEqual(["new", "recreated"])
    await tailer.stop()
  })

  it("ignores unrelated files and duplicate events with unchanged size", async () => {
    const dir = await tempLogDir()
    await writeFile(join(dir, "shader_log.txt"), "old\n")
    const lines: TailedSteamLogLine[] = []
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["shader_log.txt"],
      onLine: line => lines.push(line),
      watch: false,
    })

    await tailer.start()
    await writeFile(join(dir, "other.log"), "ignored\n")
    await tailer.scanOnce()
    await appendFile(join(dir, "shader_log.txt"), "new\n")
    await tailer.scanOnce()
    await tailer.scanOnce()

    expect(lines.map(line => line.line)).toEqual(["new"])
    await tailer.stop()
  })

  it("coalesces overlapping scans so appended ranges are emitted once", async () => {
    const dir = await tempLogDir()
    const file = join(dir, "shader_log.txt")
    await writeFile(file, "old\n")
    const lines: TailedSteamLogLine[] = []
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["shader_log.txt"],
      onLine: line => lines.push(line),
      watch: false,
    })

    await tailer.start()
    const appended = Array.from(
      { length: 5_000 },
      (_, index) => `burst ${index}`,
    )
    await appendFile(file, `${appended.join("\n")}\n`)

    await Promise.all(Array.from({ length: 8 }, () => tailer.scanOnce()))

    expect(lines.map(line => line.line)).toEqual(appended)
    expect(new Set(lines.map(line => line.line)).size).toBe(appended.length)
    await tailer.stop()
  })

  it("buffers partial lines across appends", async () => {
    const dir = await tempLogDir()
    await writeFile(join(dir, "compat_log.txt"), "")
    const lines: TailedSteamLogLine[] = []
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["compat_log.txt"],
      onLine: line => lines.push(line),
      watch: false,
    })

    await tailer.start()
    await appendFile(join(dir, "compat_log.txt"), "half")
    await tailer.scanOnce()
    await appendFile(join(dir, "compat_log.txt"), " line\r\n")
    await tailer.scanOnce()

    expect(lines.map(line => line.line)).toEqual(["half line"])
    await tailer.stop()
  })

  it("reports missing directory/read failures in health instead of throwing", async () => {
    const dir = join(await tempLogDir(), "missing")
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["content_log.txt"],
      onLine: () => {},
      watch: false,
    })

    await expect(tailer.start()).resolves.toBeUndefined()
    await expect(tailer.scanOnce()).resolves.toBeUndefined()
    expect(tailer.status()).toMatchObject({ state: "degraded" })
    await mkdir(dir)
    await writeFile(join(dir, "content_log.txt"), "appeared\n")
    await tailer.scanOnce()
    expect(tailer.status().state).toBe("running")
    await tailer.stop()
  })

  it("polls for recovery when the directory was missing before watch could attach", async () => {
    const dir = join(await tempLogDir(), "late")
    const lines: TailedSteamLogLine[] = []
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["content_log.txt"],
      onLine: line => lines.push(line),
      intervalMs: 10,
    })

    await tailer.start()
    await mkdir(dir)
    await writeFile(join(dir, "content_log.txt"), "late line\n")
    await wait(50)

    expect(lines.map(line => line.line)).toEqual(["late line"])
    expect(tailer.status().state).toBe("running")
    await tailer.stop()
  })

  it("stops watching and prevents later lines from emitting", async () => {
    const dir = await tempLogDir()
    await writeFile(join(dir, "appinfo_log.txt"), "old\n")
    const lines: TailedSteamLogLine[] = []
    const tailer = createSteamLogTailer({
      logDir: dir,
      files: ["appinfo_log.txt"],
      onLine: line => lines.push(line),
      watch: false,
    })

    await tailer.start()
    await tailer.stop()
    await appendFile(join(dir, "appinfo_log.txt"), "new\n")
    await tailer.scanOnce()

    expect(lines).toEqual([])
  })
})

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
