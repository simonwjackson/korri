import { describe, expect, it } from "bun:test"
import { chmod, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateRawSync } from "node:zlib"
import { ZIP_STORED } from "@platform/archive/zip"
import { runPluginHandler, type ExecutablePluginResource } from "@platform/plugin"
import {
  executablePath,
  type PluginExecutableResourceResolver,
  type ResolvedExecutableResource,
} from "@platform/plugin/resources"
import { Effect } from "effect"
import { createGmloaderPlugin, KORRI_GMLOADER_PLUGIN_ID } from "./plugin"

const runtimeResource: ExecutablePluginResource = {
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

describe("GMLoader plugin", () => {
  it("declares a disabled-by-default provider and Nix runtime resource", () => {
    const plugin = createGmloaderPlugin()

    expect(plugin.id).toBe(KORRI_GMLOADER_PLUGIN_ID)
    expect(
      plugin.contributes.config.providers[KORRI_GMLOADER_PLUGIN_ID],
    ).toMatchObject({
      enabledByDefault: false,
      credentialRequired: false,
    })
    expect(plugin.contributes.config.modules?.["gmloader-next"]).toMatchObject({
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#gmloader-next",
        binary: "gmloader-next",
      },
    })
  })

  it("inspects local payloads without installing them", async () => {
    const sourcePath = await writeArchive("Game.apk")
    const plugin = createGmloaderPlugin({ installRoot: await mktemp() })
    const handler = plugin.handlers.find(
      handler => handler.operation === "gmloader.payload.inspect",
    )
    if (!handler) throw new Error("missing inspect handler")

    const result = await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "gmloader.payload.inspect",
        provider: KORRI_GMLOADER_PLUGIN_ID,
        input: { sourcePath },
      }),
    )

    expect((result as { readonly _tag: string })._tag).toBe("Supported")
  })

  it("prepares a local payload launch through the handler", async () => {
    const sourcePath = await writeArchive("Launch.apk")
    const installRoot = await mktemp()
    const plugin = createGmloaderPlugin({
      installRoot,
      runtimeResource,
      runtimeResolver: resolverSucceeding(runtime),
    })
    const handler = plugin.handlers.find(
      handler => handler.operation === "gmloader.launch.path.prepare",
    )
    if (!handler) throw new Error("missing launch handler")

    const result = await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "gmloader.launch.path.prepare",
        provider: KORRI_GMLOADER_PLUGIN_ID,
        input: { sourcePath },
      }),
    )

    expect(
      (result as { readonly envelope: { readonly spec: { command: string } } })
        .envelope.spec.command,
    ).toBe(runtime.command)
    expect((result as { readonly diagnostics: readonly string[] }).diagnostics).toContain(
      "payload-materialized",
    )
  })

  it("prepares local payload launches through default runtime resource wiring", async () => {
    const sourcePath = await writeArchive("Default Handler.apk")
    const installRoot = await mktemp()
    const resourceRoot = await mktemp()
    const command = executablePath(
      resourceRoot,
      KORRI_GMLOADER_PLUGIN_ID,
      "gmloader-next",
      "gmloader-next",
    )
    await mkdir(join(command, ".."), { recursive: true })
    await writeFile(command, "#!/bin/sh\nexit 0\n")
    await chmod(command, 0o755)
    const plugin = createGmloaderPlugin({ installRoot })
    const handler = plugin.handlers.find(
      handler => handler.operation === "gmloader.launch.path.prepare",
    )
    if (!handler) throw new Error("missing launch handler")
    const previous = process.env.KORRI_PLUGIN_RESOURCE_ROOT
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = resourceRoot
    try {
      const result = await Effect.runPromise(
        runPluginHandler(handler, {
          operation: "gmloader.launch.path.prepare",
          provider: KORRI_GMLOADER_PLUGIN_ID,
          input: { sourcePath },
        }),
      )

      expect(
        (result as { readonly envelope: { readonly spec: { command: string } } })
          .envelope.spec.command,
      ).toBe(command)
      expect((result as { readonly diagnostics: readonly string[] }).diagnostics).toContain(
        "runtime-cache-hit",
      )
    } finally {
      if (previous === undefined) delete process.env.KORRI_PLUGIN_RESOURCE_ROOT
      else process.env.KORRI_PLUGIN_RESOURCE_ROOT = previous
    }
  })

  it("reports unsupported path-launch payloads as caller errors", async () => {
    const sourcePath = join(await mktemp(), "not-a-game.apk")
    await writeFile(sourcePath, Buffer.from("not a zip"))
    const plugin = createGmloaderPlugin({
      installRoot: await mktemp(),
      runtimeResource,
      runtimeResolver: resolverSucceeding(runtime),
    })
    const handler = plugin.handlers.find(
      handler => handler.operation === "gmloader.launch.path.prepare",
    )
    if (!handler) throw new Error("missing launch handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(handler, {
          operation: "gmloader.launch.path.prepare",
          provider: KORRI_GMLOADER_PLUGIN_ID,
          input: { sourcePath },
        }),
      ),
    ).rejects.toMatchObject({ reason: "caller" })
  })

  it("installs local payloads through the handler", async () => {
    const sourcePath = await writeArchive("Game.apk")
    const installRoot = await mktemp()
    const plugin = createGmloaderPlugin({ installRoot })
    const handler = plugin.handlers.find(
      handler => handler.operation === "gmloader.install",
    )
    if (!handler) throw new Error("missing install handler")

    const result = await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "gmloader.install",
        provider: KORRI_GMLOADER_PLUGIN_ID,
        input: { sourcePath, installedAt: "2026-06-24T00:00:00.000Z" },
      }),
    )

    expect((result as { readonly providerId: string }).providerId).toBe(
      KORRI_GMLOADER_PLUGIN_ID,
    )
  })
})

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
