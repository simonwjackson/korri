import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  Acquisition,
  makeLiveAcquisitionLayer,
} from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import {
  LibraryError,
  type LibrarySourceService,
} from "@platform/library/library-services"
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
  withPortMasterInstalledLibrarySource,
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

  it("wraps x86_64 PortMaster executables for FEX", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-portmaster-fex-"))
    const shellDeviceArch = "$" + "{DEVICE_ARCH}"
    const zipBytes = makeZip({
      "Digger.sh": Buffer.from(
        `#!/bin/bash\nsource "$XDG_DATA_HOME/PortMaster/control.txt"\nGAMEDIR="/$directory/ports/digger"\nexport LD_LIBRARY_PATH="$GAMEDIR/libs.${shellDeviceArch}:$LD_LIBRARY_PATH"\ncd "$GAMEDIR"\n./digger.${shellDeviceArch}\n`,
      ),
      "digger/digger.aarch64": fakeElf("aarch64"),
      "digger/digger.x86_64": fakeElf("x86_64"),
      "digger/libs.x86_64/libz.so.1": fakeElf("x86_64"),
    })
    const catalog = {
      ports: {
        "digger.zip": {
          name: "digger.zip",
          items: ["Digger.sh", "digger"],
          attr: {
            title: "Digger",
            desc: "A tiny arcade game.",
            inst: "Ready to run.",
            genres: ["arcade"],
            porter: ["PortMaster"],
            rtr: true,
            exp: false,
            runtime: [],
            reqs: [],
            arch: ["aarch64", "x86_64"],
            availability: "full",
          },
          source: {
            md5: createHash("md5").update(zipBytes).digest("hex"),
            size: zipBytes.length,
            url: "https://example.invalid/digger.zip",
          },
        },
      },
    }
    const productPlugin = createPortMasterPlugin({
      catalogPath: "/catalog/ports.json",
      installRoot: root,
      readFileText: async () => JSON.stringify(catalog),
      fetchImpl: async () =>
        new Response(zipBytes, {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      fexWrapper: {
        arch: "x86_64",
        fexPath: "/nix/store/fex/bin/FEX",
        rootfs: "/var/lib/korri/steam/fex-rootfs",
        setupEnvPath:
          "/nix/store/korri-fex-runtime/share/korri/fex-runtime/setup-env",
        env: {
          SDL_AUDIODRIVER: "dummy",
          SDL_VIDEODRIVER: "x11",
        },
      },
    })

    try {
      const install = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.install",
      ) as PluginHandler | undefined
      if (!install) throw new Error("missing portmaster.install handler")
      const manifest = await Effect.runPromise(
        runPluginHandler(install, {
          operation: "portmaster.install",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            id: "digger.zip",
            installedAt: "2026-06-18T00:00:00.000Z",
          },
        }),
      )

      expect(manifest.extracted.fexWrappers).toEqual([
        {
          path: "digger/digger.x86_64",
          arch: "x86_64",
          originalPath: "digger/.korri-fex/digger.x86_64",
          fexPath: "/nix/store/fex/bin/FEX",
          rootfs: "/var/lib/korri/steam/fex-rootfs",
          setupEnvPath:
            "/nix/store/korri-fex-runtime/share/korri/fex-runtime/setup-env",
          env: {
            SDL_AUDIODRIVER: "dummy",
            SDL_VIDEODRIVER: "x11",
          },
        },
      ])
      expect(
        manifest.extracted.fexWrappers.map(wrapper => wrapper.path),
      ).not.toContain("digger/libs.x86_64/libz.so.1")
      expect(
        await stat(
          join(root, "ports", "digger", ".korri-fex", "digger.x86_64"),
        ),
      ).toBeDefined()
      const wrapper = await readFile(
        join(root, "ports", "digger", "digger.x86_64"),
        "utf8",
      )
      expect(wrapper).toStartWith("#!/usr/bin/env bash")
      expect(wrapper).toContain("/nix/store/fex/bin/FEX")
      expect(wrapper).toContain("FEX_ROOTFS")
      expect(wrapper).toContain("SDL_VIDEODRIVER")
      expect(wrapper).toContain("x11")

      const prepareLaunch = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.prepare-launch",
      ) as PluginHandler | undefined
      if (!prepareLaunch) throw new Error("missing portmaster.prepare-launch")
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

      expect(envelope.env).toMatchObject({
        DEVICE_ARCH: "x86_64",
        FEX_ROOTFS: "/var/lib/korri/steam/fex-rootfs",
        SDL_AUDIODRIVER: "dummy",
        SDL_VIDEODRIVER: "x11",
      })
      expect(envelope.args).toContain("--bind-try")
      expect(envelope.args).toContain("/var")

      const inputEnvelope = await Effect.runPromise(
        runPluginHandler(prepareLaunch, {
          operation: "portmaster.prepare-launch",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            manifestPath: manifest.manifestPath,
            shellPath: "/run/current-system/sw/bin/bash",
            bwrapPath: "/nix/store/example-bubblewrap/bin/bwrap",
            envPath: "/run/current-system/sw/bin/env",
            useBubblewrap: true,
            inputCompatibility: {
              mode: "gptokeyb",
              gptokeybPath: "/nix/store/portmaster/PortMaster/gptokeyb",
              gptokeybLoaderPath: "/nix/store/glibc/lib/ld-linux-aarch64.so.1",
              sdlGameControllerConfig:
                "030000005e0400008e02000014010000,Xbox 360 Controller,a:b0,b:b1",
            },
          },
        }),
      )
      expect(inputEnvelope.inputCompatibility).toMatchObject({
        mode: "gptokeyb",
        bindRealUinput: true,
        gptokeybWrapperPath: join(root, "PortMaster", "gptokeyb"),
        gptokeybPath: "/nix/store/portmaster/PortMaster/gptokeyb",
        gptokeybLoaderPath: "/nix/store/glibc/lib/ld-linux-aarch64.so.1",
      })
      expect(inputEnvelope.env).toMatchObject({
        KORRI_PORTMASTER_INPUT_MODE: "gptokeyb",
        KORRI_PORTMASTER_GPTOKEYB_TARGET:
          "/nix/store/portmaster/PortMaster/gptokeyb",
        KORRI_PORTMASTER_GPTOKEYB_LOADER:
          "/nix/store/glibc/lib/ld-linux-aarch64.so.1",
        SDL_GAMECONTROLLERCONFIG:
          "030000005e0400008e02000014010000,Xbox 360 Controller,a:b0,b:b1",
      })
      expect(inputEnvelope.args).not.toContain(
        join(root, "compat", "dev", "uinput"),
      )
      const inputControl = await readFile(inputEnvelope.controlPath, "utf8")
      expect(inputControl).toContain(
        `GPTOKEYB="\${GPTOKEYB:-${join(root, "PortMaster", "gptokeyb")}}"`,
      )
      expect(inputControl).toContain("SDL_GAMECONTROLLERCONFIG=")
      const gptokeybWrapper = await readFile(
        join(root, "PortMaster", "gptokeyb"),
        "utf8",
      )
      expect(gptokeybWrapper).toStartWith("#!/usr/bin/env bash")
      expect(gptokeybWrapper).toContain("KORRI_PORTMASTER_GPTOKEYB_TARGET")
      expect(gptokeybWrapper).toContain("KORRI_PORTMASTER_GPTOKEYB_LOADER")
      expect(gptokeybWrapper).toContain(
        "/nix/store/portmaster/PortMaster/gptokeyb",
      )

      const runtimeEnvelope = await Effect.runPromise(
        runPluginHandler(prepareLaunch, {
          operation: "portmaster.prepare-launch",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            manifestPath: manifest.manifestPath,
            shellPath: "/run/current-system/sw/bin/bash",
            bwrapPath: "/nix/store/example-bubblewrap/bin/bwrap",
            envPath: "/run/current-system/sw/bin/env",
            useBubblewrap: true,
            runtimeCompatibility: {
              mode: "retroarch-libretro",
              retroarchPath: "/nix/store/retroarch/bin/retroarch",
            },
          },
        }),
      )
      expect(runtimeEnvelope.runtimeCompatibility).toMatchObject({
        mode: "retroarch-libretro",
        retroarchWrapperPath: join(root, "PortMaster", "retroarch"),
        retroarchPath: "/nix/store/retroarch/bin/retroarch",
        retroarchLogPath: join(root, "logs", "digger-retroarch.log"),
      })
      expect(runtimeEnvelope.env).toMatchObject({
        KORRI_PORTMASTER_RUNTIME_MODE: "retroarch-libretro",
        KORRI_PORTMASTER_RETROARCH_TARGET: "/nix/store/retroarch/bin/retroarch",
      })
      expect(runtimeEnvelope.args).toContain("--ro-bind")
      expect(runtimeEnvelope.args).toContain(
        join(root, "PortMaster", "retroarch"),
      )
      expect(runtimeEnvelope.args).toContain("/usr/bin/retroarch")
      const retroarchWrapper = await readFile(
        join(root, "PortMaster", "retroarch"),
        "utf8",
      )
      expect(retroarchWrapper).toStartWith("#!/run/current-system/sw/bin/bash")
      expect(retroarchWrapper).toContain("KORRI_PORTMASTER_RETROARCH_TARGET")
      expect(retroarchWrapper).toContain("/nix/store/retroarch/bin/retroarch")

      const directEnvelope = await Effect.runPromise(
        runPluginHandler(prepareLaunch, {
          operation: "portmaster.prepare-launch",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            manifestPath: manifest.manifestPath,
            shellPath: "/run/current-system/sw/bin/bash",
            useBubblewrap: false,
          },
        }),
      )
      expect(directEnvelope).toMatchObject({
        command: "/run/current-system/sw/bin/bash",
        args: [join(root, "ports", "Digger.sh")],
        env: {
          DEVICE_ARCH: "x86_64",
          FEX_ROOTFS: "/var/lib/korri/steam/fex-rootfs",
          SDL_VIDEODRIVER: "x11",
        },
      })

      const foregroundEnvelope = await Effect.runPromise(
        runPluginHandler(prepareLaunch, {
          operation: "portmaster.prepare-launch",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            manifestPath: manifest.manifestPath,
            shellPath: "/run/current-system/sw/bin/bash",
            useBubblewrap: false,
            presentation: {
              mode: "sway-fullscreen",
              swaymsgPath: "/run/current-system/sw/bin/swaymsg",
              startupPollAttempts: 2,
              startupPollDelayMs: 1,
            },
          },
        }),
      )
      expect(foregroundEnvelope).toMatchObject({
        command: join(root, "PortMaster", "launch.sh"),
        args: [],
        presentation: {
          mode: "sway-fullscreen",
          launcherPath: join(root, "PortMaster", "launch.sh"),
          logPath: join(root, "logs", "digger.log"),
          windowMatcher: '[class="digger.x86_64"]',
          swaymsgPath: "/run/current-system/sw/bin/swaymsg",
        },
      })
      const launcher = await readFile(foregroundEnvelope.command, "utf8")
      expect(launcher).toContain("set -m")
      expect(launcher).toContain('kill -- "-$child_pid"')
      expect(launcher).toContain('kill -KILL -- "-$child_pid"')
      expect(launcher).toContain("terminate()")
      expect(launcher).toContain("trap terminate INT TERM")
      expect(launcher).toContain("trap cleanup EXIT")
      expect(launcher).toContain("/run/current-system/sw/bin/swaymsg")
      expect(launcher).toContain('[class="digger.x86_64"]')
      expect(launcher).toContain(join(root, "logs", "digger.log"))
      expect(launcher).toContain("DEVICE_ARCH='x86_64'")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("auto-detects RetroArch libretro ports from extracted scripts and cores", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-portmaster-retro-"))
    const deviceArch = "$" + "{DEVICE_ARCH}"
    const zipBytes = makeZip({
      "2048.sh": Buffer.from(
        `#!/bin/bash\nsource "$XDG_DATA_HOME/PortMaster/control.txt"\nGAMEDIR="/$directory/ports/2048"\n/usr/bin/retroarch -L "$GAMEDIR/2048_libretro.so.${deviceArch}" "$GAMEDIR/2048.zip"\n`,
      ),
      "2048/2048_libretro.so.aarch64": fakeElf("aarch64"),
      "2048/2048_libretro.so.armhf": fakeElf("armhf"),
      "2048/2048.zip": Buffer.from("rom"),
    })
    const catalog = {
      ports: {
        "2048.zip": {
          name: "2048.zip",
          items: ["2048.sh", "2048"],
          attr: {
            title: "2048",
            desc: "A libretro port with incomplete catalog metadata.",
            inst: "Ready to run.",
            genres: ["puzzle"],
            porter: ["PortMaster"],
            rtr: true,
            exp: false,
            runtime: [],
            reqs: [],
            arch: ["aarch64", "armhf"],
            availability: "full",
          },
          source: {
            md5: createHash("md5").update(zipBytes).digest("hex"),
            size: zipBytes.length,
            url: "https://example.invalid/2048.zip",
          },
        },
      },
    }
    const productPlugin = createPortMasterPlugin({
      catalogPath: "/catalog/ports.json",
      installRoot: root,
      readFileText: async () => JSON.stringify(catalog),
      fetchImpl: async () =>
        new Response(zipBytes, {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
    })

    try {
      const install = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.install",
      ) as PluginHandler | undefined
      if (!install) throw new Error("missing portmaster.install handler")
      const manifest = await Effect.runPromise(
        runPluginHandler(install, {
          operation: "portmaster.install",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            id: "2048.zip",
            installedAt: "2026-06-18T00:00:00.000Z",
          },
        }),
      )

      expect(manifest.catalog.runtime).toEqual([])
      expect(manifest.extracted.runtimeDetections).toEqual([
        {
          kind: "retroarch-libretro",
          launchScriptPaths: ["2048.sh"],
          corePaths: [
            "2048/2048_libretro.so.aarch64",
            "2048/2048_libretro.so.armhf",
          ],
          evidence: [
            "file:2048/2048_libretro.so.aarch64:libretro-core",
            "file:2048/2048_libretro.so.armhf:libretro-core",
            "script:2048.sh:-L",
            "script:2048.sh:retroarch",
          ],
        },
      ])

      const prepareLaunch = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.prepare-launch",
      ) as PluginHandler | undefined
      if (!prepareLaunch) throw new Error("missing portmaster.prepare-launch")
      const autoEnvelope = await Effect.runPromise(
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

      expect(autoEnvelope.runtimeCompatibility).toMatchObject({
        mode: "retroarch-libretro",
        retroarchWrapperPath: join(root, "PortMaster", "retroarch"),
        retroarchLogPath: join(root, "logs", "2048-retroarch.log"),
      })
      expect(autoEnvelope.env).toMatchObject({
        KORRI_PORTMASTER_RUNTIME_MODE: "retroarch-libretro",
      })
      expect(autoEnvelope.args).toContain(join(root, "PortMaster", "retroarch"))
      expect(autoEnvelope.args).toContain("/usr/bin/retroarch")
      const wrapper = await readFile(
        join(root, "PortMaster", "retroarch"),
        "utf8",
      )
      expect(wrapper).toMatch(
        /target=\$\{KORRI_PORTMASTER_RETROARCH_TARGET:-'retroarch'\}/,
      )

      const disabledEnvelope = await Effect.runPromise(
        runPluginHandler(prepareLaunch, {
          operation: "portmaster.prepare-launch",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            manifestPath: manifest.manifestPath,
            shellPath: "/run/current-system/sw/bin/bash",
            useBubblewrap: false,
            runtimeCompatibility: { mode: "none" },
          },
        }),
      )
      expect(disabledEnvelope.runtimeCompatibility).toEqual({ mode: "none" })
      expect(disabledEnvelope.env).toMatchObject({
        KORRI_PORTMASTER_RUNTIME_MODE: "none",
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("generates runtime mount helpers for FRT and Godot squashfs ports", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-portmaster-frt-"))
    const runtimeRoot = join(root, "runtime-frt")
    await mkdir(runtimeRoot, { recursive: true })
    await Bun.write(join(runtimeRoot, "frt_3.3.4"), "#!/bin/sh\n")
    const runtimeExpansion = "$" + "{runtime}"
    const zipBytes = makeZip({
      "A Key.sh": Buffer.from(
        `#!/bin/bash\nsource "$XDG_DATA_HOME/PortMaster/control.txt"\nGAMEDIR="/$directory/ports/akey"\nruntime="frt_3.3.4"\nmount "$controlfolder/libs/${runtimeExpansion}.squashfs" "$HOME/godot"\nPATH="$HOME/godot:$PATH"\n"$runtime" --main-pack "$GAMEDIR/game.pck"\numount "$HOME/godot"\n`,
      ),
      "akey/game.pck": Buffer.from("pck"),
    })
    const catalog = {
      ports: {
        "akey.zip": {
          name: "akey.zip",
          items: ["A Key.sh", "akey"],
          attr: {
            title: "A Key",
            desc: "A tiny FRT game.",
            inst: "Ready to run.",
            genres: ["puzzle"],
            porter: ["PortMaster"],
            rtr: true,
            exp: false,
            runtime: ["frt_3.3.4.squashfs"],
            reqs: [],
            arch: [],
            availability: "full",
          },
          source: {
            md5: createHash("md5").update(zipBytes).digest("hex"),
            size: zipBytes.length,
            url: "https://example.invalid/akey.zip",
          },
        },
      },
    }
    const productPlugin = createPortMasterPlugin({
      catalogPath: "/catalog/ports.json",
      installRoot: root,
      compatibility: {
        "akey.zip": {
          runtimeCompatibility: {
            mode: "runtime-mounts",
            runtimeMounts: [
              { runtime: "frt_3.3.4.squashfs", sourcePath: runtimeRoot },
            ],
          },
        },
      },
      readFileText: async () => JSON.stringify(catalog),
      fetchImpl: async () =>
        new Response(zipBytes, {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
    })

    try {
      const install = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.install",
      ) as PluginHandler | undefined
      if (!install) throw new Error("missing portmaster.install handler")
      const manifest = await Effect.runPromise(
        runPluginHandler(install, {
          operation: "portmaster.install",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            id: "akey.zip",
            installedAt: "2026-06-18T00:00:00.000Z",
          },
        }),
      )
      expect(manifest.extracted.runtimeDetections).toContainEqual({
        kind: "portmaster-squashfs-runtime",
        runtimeNames: ["frt_3.3.4"],
        families: ["frt"],
        launchScriptPaths: ["A Key.sh"],
        evidence: ["catalog-runtime:frt_3.3.4"],
      })

      const prepareLaunch = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.prepare-launch",
      ) as PluginHandler | undefined
      if (!prepareLaunch) throw new Error("missing portmaster.prepare-launch")
      const envelope = await Effect.runPromise(
        runPluginHandler(prepareLaunch, {
          operation: "portmaster.prepare-launch",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            manifestPath: manifest.manifestPath,
            shellPath: "/bin/bash",
            bwrapPath: "/nix/store/example-bubblewrap/bin/bwrap",
            envPath: "/run/current-system/sw/bin/env",
            useBubblewrap: true,
          },
        }),
      )

      expect(envelope.runtimeCompatibility).toMatchObject({
        mode: "runtime-mounts",
        runtimeMountWrapperDir: join(root, "PortMaster", "runtime-bin"),
        runtimeMounts: [{ runtime: "frt_3.3.4", sourcePath: runtimeRoot }],
      })
      expect(envelope.env.PATH).toStartWith(
        `${join(root, "PortMaster", "runtime-bin")}:`,
      )
      expect(envelope.args).toContain(runtimeRoot)
      await expect(
        stat(join(root, "PortMaster", "libs", "frt_3.3.4.squashfs")),
      ).resolves.toBeDefined()
      const mountWrapper = await readFile(
        join(root, "PortMaster", "runtime-bin", "mount"),
        "utf8",
      )
      expect(mountWrapper).toContain("frt_3.3.4.squashfs")
      expect(mountWrapper).toContain(runtimeRoot)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("applies declarative compatibility profiles to installed launches", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-portmaster-compat-"))
    const zipBytes = makeZip({
      "Digger.sh": Buffer.from("#!/bin/bash\n./digger/digger.x86_64\n"),
      "Digger-x11.sh": Buffer.from("#!/bin/bash\n./digger/digger.x86_64\n"),
      "digger/digger.x86_64": fakeElf("x86_64"),
    })
    const catalog = {
      ports: {
        "digger.zip": {
          name: "digger.zip",
          items: ["Digger.sh", "Digger-x11.sh", "digger"],
          attr: {
            title: "Digger",
            desc: "A tiny x86_64 game.",
            inst: "Ready to run.",
            genres: ["arcade"],
            porter: ["PortMaster"],
            rtr: true,
            exp: false,
            runtime: [],
            reqs: [],
            arch: ["x86_64"],
            availability: "full",
          },
          source: {
            md5: createHash("md5").update(zipBytes).digest("hex"),
            size: zipBytes.length,
            url: "https://example.invalid/digger.zip",
          },
        },
      },
    }
    const productPlugin = createPortMasterPlugin({
      catalogPath: "/catalog/ports.json",
      installRoot: root,
      compatibility: {
        "digger.zip": {
          launchScript: "Digger-x11.sh",
          deviceArch: "x86_64",
          env: { SDL_VIDEODRIVER: "x11" },
          presentation: {
            mode: "sway-fullscreen",
            windowMatcher: '[title="Digger"]',
          },
        },
      },
      readFileText: async () => JSON.stringify(catalog),
      fetchImpl: async () =>
        new Response(zipBytes, {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
    })

    try {
      const install = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.install",
      ) as PluginHandler | undefined
      if (!install) throw new Error("missing portmaster.install handler")
      const manifest = await Effect.runPromise(
        runPluginHandler(install, {
          operation: "portmaster.install",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            id: "digger.zip",
            installedAt: "2026-06-18T00:00:00.000Z",
          },
        }),
      )
      expect(manifest.compatibility).toMatchObject({
        launchScript: "Digger-x11.sh",
        deviceArch: "x86_64",
        env: { SDL_VIDEODRIVER: "x11" },
      })

      const prepareLaunch = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.prepare-launch",
      ) as PluginHandler | undefined
      if (!prepareLaunch) throw new Error("missing portmaster.prepare-launch")
      const envelope = await Effect.runPromise(
        runPluginHandler(prepareLaunch, {
          operation: "portmaster.prepare-launch",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            manifestPath: manifest.manifestPath,
            shellPath: "/run/current-system/sw/bin/bash",
            useBubblewrap: false,
          },
        }),
      )

      expect(envelope).toMatchObject({
        command: join(root, "PortMaster", "launch.sh"),
        args: [],
        launchScriptPath: join(root, "ports", "Digger-x11.sh"),
        cwd: join(root, "ports"),
        env: {
          DEVICE_ARCH: "x86_64",
          SDL_VIDEODRIVER: "x11",
        },
        presentation: {
          mode: "sway-fullscreen",
          windowMatcher: '[title="Digger"]',
        },
      })
      const launcher = await readFile(envelope.command, "utf8")
      expect(launcher).toContain("Digger-x11.sh")
      expect(launcher).toContain("SDL_VIDEODRIVER='x11'")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("exposes installed PortMaster manifests as playable library entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-portmaster-library-"))
    const zipBytes = makeZip({
      "Wordle.sh": Buffer.from("#!/bin/bash\necho wordle\n"),
      "wordle/wordle": fakeElf("aarch64"),
    })
    const catalog = {
      ports: {
        "wordle.zip": {
          name: "wordle.zip",
          items: ["Wordle.sh", "wordle"],
          attr: {
            title: "Wordle SDL",
            desc: "A native PortMaster game.",
            inst: "Ready to run.",
            genres: ["puzzle"],
            porter: ["PortMaster"],
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
            url: "https://example.invalid/wordle.zip",
          },
        },
      },
    }
    const productPlugin = createPortMasterPlugin({
      catalogPath: "/catalog/ports.json",
      installRoot: root,
      readFileText: async () => JSON.stringify(catalog),
      fetchImpl: async () =>
        new Response(zipBytes, {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
    })

    try {
      const install = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.install",
      ) as PluginHandler | undefined
      if (!install) throw new Error("missing portmaster.install handler")
      await Effect.runPromise(
        runPluginHandler(install, {
          operation: "portmaster.install",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            id: "wordle.zip",
            installedAt: "2026-06-18T00:00:00.000Z",
          },
        }),
      )

      const source = withPortMasterInstalledLibrarySource(emptySource(), {
        installRoot: root,
        env: { KORRI_PORTMASTER_USE_BUBBLEWRAP: "false" },
        prepareLaunch: async input => ({
          command: "/bin/bash",
          args: [input.manifest?.extracted.launchScripts[0]?.path ?? "missing"],
          cwd: input.manifest?.portsRoot ?? root,
          env: {
            KORRI_PORTMASTER_HOME: join(root, "PortMaster"),
            DEVICE_ARCH: "aarch64",
          },
        }),
      })
      const listPlayableEntries = source.listPlayableEntries
      if (!listPlayableEntries)
        throw new Error("expected playable list support")

      const entries = await Effect.runPromise(listPlayableEntries())
      expect(entries).toMatchObject([
        {
          id: "@korri:portmaster/wordle",
          title: "Wordle SDL",
          system: "portmaster",
          launchable: true,
          userData: {
            pluginId: KORRI_PORTMASTER_PLUGIN_ID,
            portmasterId: "wordle.zip",
          },
          releases: [
            {
              id: "installed",
              system: "portmaster",
              launchable: true,
              target: {
                kind: "file",
                storage: "portmaster",
                path: join(root, "manifests", "wordle.json"),
              },
            },
          ],
        },
      ])
      await expect(Effect.runPromise(source.list())).resolves.toMatchObject([
        {
          id: "@korri:portmaster/wordle",
          system: "portmaster",
          metadata: { name: "Wordle SDL" },
        },
      ])
      await expect(
        Effect.runPromise(
          source.canResolveLaunchForGame?.("@korri:portmaster/wordle") ??
            Effect.succeed(false),
        ),
      ).resolves.toBe(true)
      const resolved = await Effect.runPromise(
        source.resolveLaunchForGame("@korri:portmaster/wordle"),
      )
      expect(resolved.spec).toEqual({
        command: "/bin/bash",
        args: ["Wordle.sh"],
        cwd: join(root, "ports"),
        env: {
          KORRI_PORTMASTER_HOME: join(root, "PortMaster"),
          DEVICE_ARCH: "aarch64",
        },
      })
      expect(resolved.playable).toMatchObject({
        id: "@korri:portmaster/wordle",
        title: "Wordle SDL",
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("wraps armhf PortMaster executables for qemu-arm", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-portmaster-armhf-"))
    const zipBytes = makeZip({
      "Lineoff.sh": Buffer.from(
        '#!/bin/bash\nsource "$XDG_DATA_HOME/PortMaster/control.txt"\nGAMEDIR="/$directory/ports/lineoff"\ncd "$GAMEDIR"\n./gmloader lineoff.apk\n',
      ),
      "lineoff/gmloader": fakeElf("armhf"),
      "lineoff/libs/libzip.so.5": fakeElf("armhf"),
      "lineoff/lineoff.apk": Buffer.from("apk"),
    })
    const catalog = {
      ports: {
        "lineoff.zip": {
          name: "lineoff.zip",
          items: ["Lineoff.sh", "lineoff"],
          attr: {
            title: "Lineoff",
            desc: "A tiny armhf game.",
            inst: "Ready to run.",
            genres: ["puzzle"],
            porter: ["PortMaster"],
            rtr: true,
            exp: false,
            runtime: [],
            reqs: [],
            arch: ["armhf"],
            availability: "full",
          },
          source: {
            md5: createHash("md5").update(zipBytes).digest("hex"),
            size: zipBytes.length,
            url: "https://example.invalid/lineoff.zip",
          },
        },
      },
    }
    const productPlugin = createPortMasterPlugin({
      catalogPath: "/catalog/ports.json",
      installRoot: root,
      readFileText: async () => JSON.stringify(catalog),
      fetchImpl: async () =>
        new Response(zipBytes, {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      armhfQemuWrapper: {
        qemuArmPath: "/nix/store/qemu/bin/qemu-arm",
        rootfs: "/var/lib/korri/armhf-rootfs",
        libraryPaths: [
          "/nix/store/glibc-armhf/lib",
          "/nix/store/gcc-armhf/lib",
        ],
        env: {
          SDL_AUDIODRIVER: "dummy",
          SDL_VIDEODRIVER: "x11",
        },
      },
    })

    try {
      const install = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.install",
      ) as PluginHandler | undefined
      if (!install) throw new Error("missing portmaster.install handler")
      const manifest = await Effect.runPromise(
        runPluginHandler(install, {
          operation: "portmaster.install",
          provider: KORRI_PORTMASTER_PLUGIN_ID,
          input: {
            id: "lineoff.zip",
            installedAt: "2026-06-18T00:00:00.000Z",
          },
        }),
      )

      expect(manifest.extracted.armhfQemuWrappers).toEqual([
        {
          path: "lineoff/gmloader",
          arch: "armhf",
          originalPath: "lineoff/.korri-qemu-arm/gmloader",
          qemuArmPath: "/nix/store/qemu/bin/qemu-arm",
          rootfs: "/var/lib/korri/armhf-rootfs",
          libraryPaths: [
            "/nix/store/glibc-armhf/lib",
            "/nix/store/gcc-armhf/lib",
          ],
          env: {
            SDL_AUDIODRIVER: "dummy",
            SDL_VIDEODRIVER: "x11",
          },
        },
      ])
      expect(
        manifest.extracted.armhfQemuWrappers.map(wrapper => wrapper.path),
      ).not.toContain("lineoff/libs/libzip.so.5")
      expect(
        await stat(
          join(root, "ports", "lineoff", ".korri-qemu-arm", "gmloader"),
        ),
      ).toBeDefined()
      const wrapper = await readFile(
        join(root, "ports", "lineoff", "gmloader"),
        "utf8",
      )
      expect(wrapper).toStartWith("#!/usr/bin/env bash")
      expect(wrapper).toContain("/nix/store/qemu/bin/qemu-arm")
      expect(wrapper).toContain("KORRI_PORTMASTER_ARMHF_ROOTFS")
      expect(wrapper).toContain("/var/lib/korri/armhf-rootfs")
      expect(wrapper).toContain("LD_LIBRARY_PATH")
      expect(wrapper).toContain(
        "/nix/store/glibc-armhf/lib:/nix/store/gcc-armhf/lib",
      )
      expect(wrapper).toContain("SDL_VIDEODRIVER")
      expect(wrapper).toContain("x11")

      const prepareLaunch = productPlugin.handlers.find(
        candidate => candidate.operation === "portmaster.prepare-launch",
      ) as PluginHandler | undefined
      if (!prepareLaunch) throw new Error("missing portmaster.prepare-launch")
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

      expect(envelope.env).toMatchObject({
        DEVICE_ARCH: "armhf",
        KORRI_PORTMASTER_ARMHF_ROOTFS: "/var/lib/korri/armhf-rootfs",
        KORRI_PORTMASTER_ARMHF_LIBRARY_PATH:
          "/nix/store/glibc-armhf/lib:/nix/store/gcc-armhf/lib",
        SDL_AUDIODRIVER: "dummy",
        SDL_VIDEODRIVER: "x11",
      })
      expect(envelope.args).toContain("--bind-try")
      expect(envelope.args).toContain("/var")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function emptySource(): LibrarySourceService {
  return {
    list: () => Effect.succeed([]),
    listPlayableEntries: () => Effect.succeed([]),
    launchSpecFor: () => Effect.succeed(undefined),
    canResolveLaunchForGame: () => Effect.succeed(false),
    resolveLaunchForGame: id =>
      Effect.fail(
        new LibraryError({ reason: "config", message: `missing ${id}` }),
      ),
  }
}

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
