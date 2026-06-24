import { describe, expect, it } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateRawSync } from "node:zlib"
import { ZIP_STORED } from "@platform/archive/zip"
import type { ExecutablePluginResource } from "@platform/plugin"
import {
  PluginResourceMissing,
  type PluginExecutableResourceResolver,
  type ResolvedExecutableResource,
} from "@platform/plugin/resources"
import { Effect } from "effect"
import { prepareGmloaderPathLaunch } from "./path-launch"

const resource: ExecutablePluginResource = {
  id: "gmloader-next",
  kind: "executable",
  fulfill: {
    provider: "nix",
    installable: ".#gmloader-next",
    binary: "gmloader-next",
  },
}

const runtime: ResolvedExecutableResource = {
  pluginId: "@korri:gmloader",
  resourceId: "gmloader-next",
  command: "/store/gmloader/bin/gmloader-next",
}

describe("GMLoader path launch", () => {
  it("materializes a source APK and returns a launch envelope", async () => {
    const sourcePath = await writeArchive("Path Game.apk")
    const installRoot = await mktemp()

    const result = await Effect.runPromise(
      prepareGmloaderPathLaunch({
        providerId: "@korri:gmloader",
        sourcePath,
        installRoot,
        runtimeResource: resource,
        runtimeResolver: resolverSucceeding(runtime),
      }),
    )

    expect(result.payloadStatus).toBe("materialized")
    expect(result.runtimeStatus).toBe("cache-hit")
    expect(result.diagnostics).toEqual([
      "payload-materialized",
      "runtime-cache-hit",
    ])
    expect(result.envelope.spec).toMatchObject({
      command: runtime.command,
      args: ["-c", result.manifest.run.configPath],
      cwd: result.manifest.gameRoot,
    })
    expect(await readFile(result.manifest.run.configPath, "utf8")).toContain(
      "assets/game.droid",
    )
  })

  it("reuses a cached payload on repeated source APK launches", async () => {
    const sourcePath = await writeArchive("Path Game.apk")
    const installRoot = await mktemp()

    const first = await Effect.runPromise(
      prepareGmloaderPathLaunch({
        providerId: "@korri:gmloader",
        sourcePath,
        installRoot,
        runtimeResource: resource,
        runtimeResolver: resolverSucceeding(runtime),
      }),
    )
    const second = await Effect.runPromise(
      prepareGmloaderPathLaunch({
        providerId: "@korri:gmloader",
        sourcePath,
        installRoot,
        runtimeResource: resource,
        runtimeResolver: resolverSucceeding(runtime),
      }),
    )

    expect(first.payloadStatus).toBe("materialized")
    expect(second.payloadStatus).toBe("cache-hit")
    expect(second.manifest.id).toBe(first.manifest.id)
    expect(second.diagnostics).toContain("payload-cache-hit")
  })

  it("keeps a materialized payload when runtime resolution fails", async () => {
    const sourcePath = await writeArchive("Runtime Missing.apk")
    const installRoot = await mktemp()

    const exit = await Effect.runPromiseExit(
      prepareGmloaderPathLaunch({
        providerId: "@korri:gmloader",
        sourcePath,
        installRoot,
        runtimeResource: resource,
        runtimeResolver: resolverMissing(),
      }),
    )

    expect(exit._tag).toBe("Failure")
    const games = await import("node:fs/promises").then(fs =>
      fs.readdir(join(installRoot, "games")),
    )
    expect(games.length).toBe(1)
  })
})

function resolverSucceeding(
  resolved: ResolvedExecutableResource,
): PluginExecutableResourceResolver {
  return { resolveExecutable: () => Effect.succeed(resolved) }
}

function resolverMissing(): PluginExecutableResourceResolver {
  return {
    resolveExecutable: () =>
      Effect.fail(
        new PluginResourceMissing({
          pluginId: "@korri:gmloader",
          resourceId: "gmloader-next",
          path: "/missing/gmloader-next",
        }),
      ),
  }
}

async function writeArchive(name: string): Promise<string> {
  const path = join(await mktemp(), name)
  await writeFile(
    path,
    createZip([
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game"),
        method: ZIP_STORED,
      },
      {
        path: "lib/arm64-v8a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ]),
  )
  return path
}

async function mktemp(): Promise<string> {
  return import("node:fs/promises").then(fs =>
    fs.mkdtemp(join(tmpdir(), "korri-gmloader-")),
  )
}

function createZip(
  entries: readonly {
    readonly path: string
    readonly bytes: Buffer
    readonly method: number
  }[],
): Buffer {
  const fileRecords: Buffer[] = []
  const centralRecords: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.path)
    const compressed =
      entry.method === 8 ? deflateRawSync(entry.bytes) : entry.bytes
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(entry.method, 8)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.bytes.length, 22)
    local.writeUInt16LE(name.length, 26)
    fileRecords.push(local, name, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(entry.method, 10)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.bytes.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centralRecords.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const centralOffset = offset
  const central = Buffer.concat(centralRecords)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([...fileRecords, central, eocd])
}
