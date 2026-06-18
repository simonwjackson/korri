import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  Acquisition,
  makeLiveAcquisitionLayer,
} from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import { type PluginHandler, runPluginHandler } from "@platform/plugin"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { Effect } from "effect"
import {
  createPortMasterPlugin,
  KORRI_PORTMASTER_PLUGIN_ID,
  portmasterPlugin,
} from ".."

const catalogFixture = {
  ports: {
    "2048.zip": {
      name: "2048.zip",
      attr: {
        title: "2048",
        desc: "The 2048 puzzle game.",
        inst: "Ready to run.",
        genres: ["puzzle"],
        porter: ["Christian_Haitian"],
        rtr: true,
        exp: false,
        runtime: [],
        reqs: [],
        arch: ["aarch64", "armhf"],
        availability: "full",
      },
      source: {
        md5: "96a5de9fbc08bb5ae8498a9f4fd43b11",
        release_id: "2026-04-12_1606",
        size: 12345,
        url: "https://github.com/PortsMaster/PortMaster-New/releases/download/2026-04-12_1606/2048.zip",
      },
    },
    "absolutereflex.zip": {
      name: "absolutereflex.zip",
      attr: {
        title: "Absolute Reflex",
        desc: "A non-ready-to-run PortMaster entry.",
        inst: "Copy commercial game data into the port folder.",
        genres: ["action"],
        porter: ["Porter"],
        rtr: false,
        exp: false,
        runtime: [],
        reqs: [],
        arch: ["aarch64"],
        availability: "paid",
      },
      source: {
        url: "https://github.com/PortsMaster/PortMaster-New/releases/download/2025-01-01_0000/absolutereflex.zip",
      },
    },
  },
}

describe("PortMaster plugin", () => {
  it("declares a stable executable package resource and acquisition handlers", () => {
    expect(portmasterPlugin.id).toBe(KORRI_PORTMASTER_PLUGIN_ID)
    expect(
      portmasterPlugin.contributes.config.modules?.portmaster,
    ).toMatchObject({
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#portmaster",
        binary: "portmaster",
      },
    })
    expect(portmasterPlugin.handlers.map(handler => handler.operation)).toEqual(
      [
        "claims.search",
        "claims.details",
        "claims.parse-url",
        "provider.validate",
        "artifact.resolve-download",
        "portmaster.install",
        "portmaster.prepare-launch",
        "diagnostics.collect",
      ],
    )
  })

  it("exposes PortMaster as a fulfillable executable when enabled", () => {
    const registry = createPluginRegistry([portmasterPlugin], {
      enabledPluginIds: [KORRI_PORTMASTER_PLUGIN_ID],
    })

    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["portmaster"])
  })

  it("runs catalog search, details, health, parsing, and download through the acquisition boundary", async () => {
    const productRegistry = createPluginRegistry(
      [
        createPortMasterPlugin({
          catalogPath: "/catalog/ports.json",
          readFileText: async () => JSON.stringify(catalogFixture),
        }),
      ],
      { enabledPluginIds: [KORRI_PORTMASTER_PLUGIN_ID] },
    )
    const acquisitionRegistry = createStaticAcquisitionPluginRegistry(
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
    )
    const layer = makeLiveAcquisitionLayer({ registry: acquisitionRegistry })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acquisition = yield* Acquisition
        return {
          search: yield* acquisition.search({ query: "2048" }),
          details: yield* acquisition.details({
            providerId: KORRI_PORTMASTER_PLUGIN_ID,
            id: "2048.zip",
          }),
          health: yield* acquisition.validateProviders({
            providerIds: [KORRI_PORTMASTER_PLUGIN_ID],
          }),
          download: yield* acquisition.resolveDownload({
            providerId: KORRI_PORTMASTER_PLUGIN_ID,
            candidateUrl: "https://portmaster.games/detail.html?name=2048",
          }),
          directDownload: yield* acquisition.resolveDownload({
            providerId: KORRI_PORTMASTER_PLUGIN_ID,
            candidateUrl:
              "https://github.com/PortsMaster/PortMaster-New/releases/download/2026-04-12_1606/2048.zip",
          }),
          notReady: yield* acquisition.resolveDownload({
            providerId: KORRI_PORTMASTER_PLUGIN_ID,
            candidateUrl:
              "https://portmaster.games/detail.html?name=absolutereflex",
          }),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.search.claims).toHaveLength(1)
    expect(result.search.claims[0]).toMatchObject({
      providerId: KORRI_PORTMASTER_PLUGIN_ID,
      id: "2048.zip",
      title: "2048",
      platform: "linux-port",
      playable: {
        id: "2048",
        releases: [
          {
            id: "linux-port",
            system: "linux-port",
            display: {
              readyToRun: true,
              arch: ["aarch64", "armhf"],
            },
          },
        ],
      },
    })
    expect(result.details.description).toContain("The 2048 puzzle game")
    expect(result.details.facets?.tags).toContain("ready-to-run")
    expect(result.details.facets?.tags).toContain("arch:aarch64")
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.download).toMatchObject({
      _tag: "FinalDownload",
      providerId: KORRI_PORTMASTER_PLUGIN_ID,
      url: "https://github.com/PortsMaster/PortMaster-New/releases/download/2026-04-12_1606/2048.zip",
      filename: "2048.zip",
      contentType: "application/zip",
    })
    expect(result.directDownload).toMatchObject({
      _tag: "FinalDownload",
      filename: "2048.zip",
    })
    expect(result.notReady).toMatchObject({
      _tag: "FailedDownload",
      reason: "not-found",
      message: "PortMaster entry is not ready-to-run",
    })
  })

  it("installs a ready-to-run catalog zip into a PortMaster ports layout", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-portmaster-install-"))
    const zipBytes = makeZip({
      "Wordle SDL.sh": Buffer.from("#!/bin/bash\n./wordlesdl/wordle\n"),
      "wordlesdl/wordle": fakeElf("aarch64"),
      "wordlesdl/data/words.txt": Buffer.from("korri\n"),
    })
    const catalog = {
      ports: {
        "wordlesdl.zip": {
          name: "wordlesdl.zip",
          items: ["Wordle SDL.sh", "wordlesdl/"],
          attr: {
            title: "Wordle SDL",
            desc: "A tiny word game.",
            inst: "Ready to run.",
            genres: ["puzzle"],
            porter: ["tabreturn"],
            rtr: true,
            exp: false,
            runtime: [],
            reqs: [],
            arch: ["aarch64"],
            availability: "full",
          },
          source: {
            md5: createHash("md5").update(zipBytes).digest("hex"),
            size: zipBytes.length,
            url: "https://example.invalid/wordlesdl.zip",
          },
        },
      },
    }
    const repairCommands: Array<{
      readonly command: string
      readonly args: readonly string[]
    }> = []
    const productPlugin = createPortMasterPlugin({
      catalogPath: "/catalog/ports.json",
      installRoot: root,
      readFileText: async () => JSON.stringify(catalog),
      fetchImpl: async () =>
        new Response(zipBytes, {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      nativeElfRepair: {
        arch: "aarch64",
        interpreter: "/nix/store/glibc/lib/ld-linux-aarch64.so.1",
        libraryPaths: ["/nix/store/glibc/lib", "/nix/store/sdl2/lib"],
        patchelfPath: "/nix/store/patchelf/bin/patchelf",
        runCommand: async (command, args) => {
          repairCommands.push({ command, args })
        },
      },
    })

    try {
      const handler = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.install",
      ) as PluginHandler | undefined
      if (!handler) throw new Error("missing portmaster.install handler")

      const manifest = await Effect.runPromise(
        runPluginHandler(handler, {
          operation: "portmaster.install",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            id: "wordlesdl.zip",
            installedAt: "2026-06-18T00:00:00.000Z",
          },
        }),
      )

      expect(manifest).toMatchObject({
        schemaVersion: 1,
        id: "wordlesdl.zip",
        title: "Wordle SDL",
        portsRoot: join(root, "ports"),
        catalog: {
          items: ["Wordle SDL.sh", "wordlesdl/"],
          arch: ["aarch64"],
          runtime: [],
          readyToRun: true,
        },
      })
      expect(manifest.extracted.launchScripts).toEqual([
        { path: "Wordle SDL.sh", sizeBytes: 31 },
      ])
      expect(manifest.extracted.binaries).toEqual([
        {
          path: "wordlesdl/wordle",
          sizeBytes: 64,
          format: "elf",
          elfClass: "64",
          machine: "EM_AARCH64",
          arch: "aarch64",
        },
      ])
      expect(manifest.extracted.nativeElfRepairs).toEqual([
        {
          path: "wordlesdl/wordle",
          arch: "aarch64",
          interpreter: "/nix/store/glibc/lib/ld-linux-aarch64.so.1",
          rpath: "/nix/store/glibc/lib:/nix/store/sdl2/lib",
          patchelfPath: "/nix/store/patchelf/bin/patchelf",
        },
      ])
      expect(repairCommands).toEqual([
        {
          command: "/nix/store/patchelf/bin/patchelf",
          args: [
            "--set-interpreter",
            "/nix/store/glibc/lib/ld-linux-aarch64.so.1",
            "--set-rpath",
            "/nix/store/glibc/lib:/nix/store/sdl2/lib",
            join(root, "ports", "wordlesdl", "wordle"),
          ],
        },
      ])
      expect(await stat(join(root, "ports", "Wordle SDL.sh"))).toBeDefined()
      expect(
        await stat(join(root, "ports", "wordlesdl", "wordle")),
      ).toBeDefined()
      expect(
        JSON.parse(await readFile(manifest.manifestPath, "utf8")),
      ).toMatchObject({ id: "wordlesdl.zip", title: "Wordle SDL" })

      const prepareLaunch = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.prepare-launch",
      ) as PluginHandler | undefined
      if (!prepareLaunch) {
        throw new Error("missing portmaster.prepare-launch handler")
      }
      const envelope = await Effect.runPromise(
        runPluginHandler(prepareLaunch, {
          operation: "portmaster.prepare-launch",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            manifestPath: manifest.manifestPath,
            shellPath: "/run/current-system/sw/bin/bash",
            bwrapPath: "/nix/store/example-bubblewrap/bin/bwrap",
            envPath: "/run/current-system/sw/bin/env",
            useBubblewrap: true,
          },
        }),
      )

      expect(envelope).toMatchObject({
        command: "/nix/store/example-bubblewrap/bin/bwrap",
        cwd: join(root, "ports"),
        launchScriptPath: join(root, "ports", "Wordle SDL.sh"),
        controlPath: join(root, "PortMaster", "control.txt"),
        tasksetterPath: join(root, "PortMaster", "tasksetter"),
        env: {
          XDG_DATA_HOME: root,
          KORRI_PORTMASTER_DIRECTORY: root.replace(/^\/+/, ""),
          KORRI_PORTMASTER_PORTS_ROOT: join(root, "ports"),
          DEVICE_ARCH: "aarch64",
        },
      })
      expect(envelope.args).toContain("/bin/bash")
      expect(envelope.args).toContain("/sys")
      expect(envelope.args).toContain(join(root, "ports", "Wordle SDL.sh"))
      expect(await readFile(envelope.controlPath, "utf8")).toContain(
        "get_controls()",
      )
      const controlText = await readFile(envelope.controlPath, "utf8")
      expect(controlText).toContain('ESUDO="')
      expect(controlText).toContain(':-}"')
      expect(await readFile(envelope.controlPath, "utf8")).toContain(
        "GPTOKEYB=",
      )
      expect(await readFile(envelope.tasksetterPath, "utf8")).toContain(
        "TASKSET=",
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function fakeElf(arch: "aarch64" | "x86_64" | "x86" | "armhf"): Buffer {
  const bytes = Buffer.alloc(64)
  bytes[0] = 0x7f
  bytes[1] = 0x45
  bytes[2] = 0x4c
  bytes[3] = 0x46
  bytes[4] = arch === "aarch64" || arch === "x86_64" ? 2 : 1
  bytes[5] = 1
  const machine = {
    aarch64: 183,
    x86_64: 62,
    x86: 3,
    armhf: 40,
  }[arch]
  bytes.writeUInt16LE(machine, 18)
  return bytes
}

function makeZip(entries: Record<string, Buffer>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const [path, data] of Object.entries(entries)) {
    const name = Buffer.from(path)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt32LE(0, 10)
    localHeader.writeUInt32LE(0, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, name, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt32LE(0, 12)
    centralHeader.writeUInt32LE(0, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, name)

    offset += localHeader.length + name.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, end])
}
