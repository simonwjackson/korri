import { describe, expect, it } from "bun:test"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateRawSync } from "node:zlib"
import { ZIP_STORED } from "@platform/archive/zip"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import {
  runPluginHandler,
  type ExecutablePluginResource,
} from "@platform/plugin"
import type {
  PluginExecutableResourceResolver,
  ResolvedExecutableResource,
} from "@platform/plugin/resources"
import { Effect } from "effect"
import { createGmloaderReadableLaunchIntegration } from "./materializer"
import { createGmloaderPlugin, KORRI_GMLOADER_PLUGIN_ID } from "./plugin"

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
  pluginId: KORRI_GMLOADER_PLUGIN_ID,
  resourceId: "gmloader-next",
  command: "/store/gmloader/bin/gmloader-next",
}

describe("GMLoader path-run flow", () => {
  it("materializes once and then reuses the same cache across handler and readable launch paths", async () => {
    const sourcePath = await writeArchive("End To End.apk")
    const installRoot = await mktemp()
    const runtimeResolver = resolverSucceeding(runtime)
    const plugin = createGmloaderPlugin({
      installRoot,
      runtimeResource: resource,
      runtimeResolver,
    })
    const handler = plugin.handlers.find(
      handler => handler.operation === "gmloader.launch.path.prepare",
    )
    if (!handler) throw new Error("missing path launch handler")

    const first = (await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "gmloader.launch.path.prepare",
        provider: KORRI_GMLOADER_PLUGIN_ID,
        input: { sourcePath },
      }),
    )) as PathRunResult

    const integration = createGmloaderReadableLaunchIntegration({
      installRoot,
      runtimeResource: resource,
      runtimeResolver,
    })
    const second = await Effect.runPromise(
      integration.materialize(context({ sourcePath }), {}),
    )

    expect(first.payloadStatus).toBe("materialized")
    expect(first.runtimeStatus).toBe("cache-hit")
    expect(first.envelope.spec.command).toBe(runtime.command)
    expect(first.envelope.spec.args).toEqual([
      "-c",
      first.manifest.run.configPath,
    ])
    expect(second.diagnostics).toEqual([
      "payload-cache-hit",
      "runtime-cache-hit",
    ])
    expect(second.spec.command).toBe(runtime.command)
    expect(second.spec.args).toEqual(first.envelope.spec.args)
  })
})

interface PathRunResult {
  readonly manifest: { readonly run: { readonly configPath: string } }
  readonly envelope: {
    readonly spec: {
      readonly command: string
      readonly args: readonly string[]
    }
  }
  readonly payloadStatus: string
  readonly runtimeStatus: string
}

function context(input: {
  readonly sourcePath: string
}): ReadableResolvedLaunchContext {
  return {
    playableId: "gmloader-e2e",
    itemId: "gmloader-e2e",
    releaseId: "apk",
    system: "gmloader",
    target: "apk",
    app: {
      id: "gmloader-runtime",
      plugin: KORRI_GMLOADER_PLUGIN_ID,
      command: "gmloader-next",
    },
    content: { path: input.sourcePath },
    launchCompanions: {},
  }
}

function resolverSucceeding(
  resolved: ResolvedExecutableResource,
): PluginExecutableResourceResolver {
  return { resolveExecutable: () => Effect.succeed(resolved) }
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
    fs.mkdtemp(join(tmpdir(), "korri-gmloader-e2e-")),
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
