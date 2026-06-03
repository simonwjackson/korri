import { describe, expect, test } from "bun:test"
import { mkdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import {
  buildDesktopStatusFileContent,
  writeDesktopStatusFile,
} from "./status-file"

describe("desktop status file", () => {
  test("builds stable status content for smoke tooling", () => {
    expect(
      buildDesktopStatusFileContent({
        url: "http://127.0.0.1:4321/",
        pid: 123,
        profile: "device",
        timestamp: new Date("2026-05-05T12:00:00.000Z"),
      }),
    ).toEqual({
      url: "http://127.0.0.1:4321/",
      pid: 123,
      profile: "device",
      timestamp: "2026-05-05T12:00:00.000Z",
    })
  })

  test("writes JSON and creates the parent directory", async () => {
    const root = join(process.cwd(), "out/tmp/desktop-status-file")
    const path = join(root, crypto.randomUUID(), "status.json")

    await writeDesktopStatusFile({
      path,
      url: "http://127.0.0.1:4321/",
      pid: 123,
      profile: "device",
      timestamp: new Date("2026-05-05T12:00:00.000Z"),
    })

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      url: "http://127.0.0.1:4321/",
      pid: 123,
      profile: "device",
      timestamp: "2026-05-05T12:00:00.000Z",
    })

    await rm(root, { recursive: true, force: true })
  })

  test("fails when a parent path is not a directory", async () => {
    const root = join(process.cwd(), "out/tmp/desktop-status-file")
    const parentFile = join(root, crypto.randomUUID())
    await mkdir(root, { recursive: true })
    await Bun.write(parentFile, "not a directory")

    await expect(
      writeDesktopStatusFile({
        path: join(parentFile, "status.json"),
        url: "http://127.0.0.1:4321/",
        pid: 123,
        profile: "device",
      }),
    ).rejects.toThrow()

    await rm(root, { recursive: true, force: true })
  })
})
