import { describe, expect, it } from "bun:test"
import { chmod, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateRawSync } from "node:zlib"
import { ZIP_STORED } from "@platform/archive/zip"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import type { ExecutablePluginResource } from "@platform/plugin"
import {
  executablePath,
  type PluginExecutableResourceResolver,
  type ResolvedExecutableResource,
} from "@platform/plugin/resources"
import { Effect } from "effect"
import {
  createGmloaderReadableLaunchIntegration,
  materializeReadableGmloaderLaunch,
} from "./materializer"
import { KORRI_GMLOADER_PLUGIN_ID } from "./plugin"

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

describe("GMLoader readable launch materializer", () => {
  it("materializes a path-backed GMLoader entry into a launch spec", async () => {
    const sourcePath = await writeArchive("Readable.apk")
    const installRoot = await mktemp()

    const result = await Effect.runPromise(
      materializeReadableGmloaderLaunch({
        context: context({ sourcePath }),
        installRoot,
        runtimeResource: resource,
        runtimeResolver: resolverSucceeding(runtime),
      }),
    )

    expect(result.spec.command).toBe(runtime.command)
    expect(result.spec.args).toEqual(["-c", result.paths.configPath])
    expect(result.diagnostics).toEqual([
      "payload-materialized",
      "runtime-cache-hit",
    ])
  })

  it("reuses the cached payload when materializing the same context twice", async () => {
    const sourcePath = await writeArchive("Readable.apk")
    const installRoot = await mktemp()
    await Effect.runPromise(
      materializeReadableGmloaderLaunch({
        context: context({ sourcePath }),
        installRoot,
        runtimeResource: resource,
        runtimeResolver: resolverSucceeding(runtime),
      }),
    )

    const second = await Effect.runPromise(
      materializeReadableGmloaderLaunch({
        context: context({ sourcePath }),
        installRoot,
        runtimeResource: resource,
        runtimeResolver: resolverSucceeding(runtime),
      }),
    )

    expect(second.diagnostics).toContain("payload-cache-hit")
  })

  it("uses the default plugin resource root to resolve packaged runtime", async () => {
    const sourcePath = await writeArchive("Default Runtime.apk")
    const installRoot = await mktemp()
    const stateHome = await mktemp()
    const resourceRoot = join(stateHome, "korri", "plugins", "resources")
    const command = executablePath(
      resourceRoot,
      KORRI_GMLOADER_PLUGIN_ID,
      "gmloader-next",
      "gmloader-next",
    )
    await mkdir(join(command, ".."), { recursive: true })
    await writeFile(command, "#!/bin/sh\nexit 0\n")
    await chmod(command, 0o755)

    const result = await Effect.runPromise(
      materializeReadableGmloaderLaunch({
        context: context({ sourcePath }),
        installRoot,
        env: { XDG_STATE_HOME: stateHome },
      }),
    )

    expect(result.spec.command).toBe(command)
    expect(result.diagnostics).toContain("runtime-cache-hit")
  })

  it("propagates diagnostics through the readable integration", async () => {
    const sourcePath = await writeArchive("Readable.apk")
    const installRoot = await mktemp()
    const integration = createGmloaderReadableLaunchIntegration({
      installRoot,
      runtimeResource: resource,
      runtimeResolver: resolverSucceeding(runtime),
    })

    const result = await Effect.runPromise(
      integration.materialize(context({ sourcePath }), {}),
    )

    expect(result.diagnostics).toEqual([
      "payload-materialized",
      "runtime-cache-hit",
    ])
  })

  it("only resolves contexts with GMLoader kind and source path", () => {
    const integration = createGmloaderReadableLaunchIntegration({
      installRoot: "/tmp/gmloader",
      runtimeResource: resource,
      runtimeResolver: resolverSucceeding(runtime),
    })

    expect(integration.canResolve(context({ sourcePath: "/game.apk" }))).toBe(
      true,
    )
    expect(
      integration.canResolve({
        ...context({ sourcePath: "/game.apk" }),
        app: { id: "other", plugin: "@korri:process" },
      }),
    ).toBe(false)
    expect(
      integration.canResolve({
        ...context({ sourcePath: "/game.apk" }),
        content: undefined,
      }),
    ).toBe(false)
  })
})

function context(input: {
  readonly sourcePath: string
}): ReadableResolvedLaunchContext {
  return {
    playableId: "gmloader-readable",
    itemId: "gmloader-readable",
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
