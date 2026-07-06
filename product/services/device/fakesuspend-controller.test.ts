import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createFakeSuspendController,
  type FakeSuspendCommand,
} from "./fakesuspend-controller"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function tempRoot() {
  const path = await mkdtemp(join(tmpdir(), "korri-fakesuspend-"))
  tempDirs.push(path)
  return path
}

async function makeHarness(options: { readonly createRequestDir?: boolean } = {}) {
  const root = await tempRoot()
  const runtimeDir = join(root, "runtime")
  const requestDir = join(root, "requests")
  const resultDir = join(root, "status")
  await mkdir(runtimeDir, { recursive: true })
  await mkdir(resultDir, { recursive: true })
  if (options.createRequestDir !== false) await mkdir(requestDir)

  const commands: FakeSuspendCommand[] = []
  const controller = createFakeSuspendController({
    runtimeDir,
    requestDir,
    resultDir,
    now: () => 10_000,
    ackTimeoutMs: 0,
    commandRunner: async command => {
      commands.push(command)
    },
    sessiond: { env: {} as NodeJS.ProcessEnv },
  })

  return { root, runtimeDir, requestDir, resultDir, commands, controller }
}

describe("fake suspend controller", () => {
  it("suspends by blanking Sway, writing an active marker, and requesting substrate enter", async () => {
    const { runtimeDir, requestDir, commands, controller } = await makeHarness()
    await writeFile(join(runtimeDir, "sway-ipc.100.sock"), "")

    const result = await controller.run("suspend")

    expect(result.status).toBe("requested")
    expect(commands).toEqual([
      {
        command: "swaymsg",
        args: ["output", "*", "power", "off"],
        env: { SWAYSOCK: join(runtimeDir, "sway-ipc.100.sock") },
      },
    ])
    expect(await readFile(join(runtimeDir, "korri-fakesuspend", "active"), "utf8")).toContain("suspended")
    expect(await readFile(join(requestDir, "enter.request"), "utf8")).toBe("")
    expect((await stat(join(runtimeDir, "korri-fakesuspend"))).mode & 0o777).toBe(0o700)
  })

  it("does not write exit.request when resume is requested without an active marker", async () => {
    const { requestDir, controller } = await makeHarness()

    const result = await controller.run("resume")

    expect(result).toEqual({ status: "noop", reason: "not-suspended" })
    await expect(stat(join(requestDir, "exit.request"))).rejects.toThrow()
  })

  it("does not create the substrate request directory when it is missing", async () => {
    const { requestDir, controller } = await makeHarness({ createRequestDir: false })

    const result = await controller.run("suspend")

    expect(result).toEqual({ status: "degraded", reason: "request-dir-missing" })
    await expect(stat(requestDir)).rejects.toThrow()
  })

  it("reports substrate-unavailable when the watcher does not acknowledge a request", async () => {
    const { controller } = await makeHarness()

    const result = await controller.run("suspend")

    expect(result).toEqual({ status: "requested" })
  })

  it("maps a fresh watcher acknowledgement to applied", async () => {
    const { resultDir, controller } = await makeHarness()
    await writeFile(
      join(resultDir, "last-request"),
      "action=enter\nstatus=processed\nresult=ok\n",
    )

    const result = await controller.run("suspend")

    expect(result).toEqual({ status: "applied" })
  })

  it("debounces repeated power toggles", async () => {
    const { controller } = await makeHarness()

    expect(await controller.run("toggle")).toEqual({ status: "requested" })
    expect(await controller.run("toggle")).toEqual({
      status: "noop",
      reason: "debounced",
    })
  })

  it("does not resume from power toggle while the lid-closed marker is active", async () => {
    const { runtimeDir, controller } = await makeHarness()
    await controller.run("suspend")
    await writeFile(join(runtimeDir, "korri-fakesuspend", "lid-closed"), "1\n")

    const result = await controller.run("toggle")

    expect(result).toEqual({ status: "noop", reason: "lid-closed" })
  })
})
