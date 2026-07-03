import { describe, expect, it } from "bun:test"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  KorriControl,
  type KorriControlService,
} from "@platform/control/korri-control"
import type { LibraryReleasePayload } from "@platform/library/config/records/library-item"
import { decodeLibraryItemPayload } from "@platform/library/config/records/library-item"
import type { LaunchSpec } from "@platform/library/launcher"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { executablePath } from "@platform/plugin/resources"
import { KORRI_RETROARCH_PLUGIN_ID } from "@product/plugins/retroarch"
import { KORRI_SRB2_PLUGIN_ID } from "@product/plugins/srb2"
import { Effect, Exit, Layer } from "effect"
import { parse } from "yaml"
import { runKorriCli, runKorriCliWithLayer } from "./korri-cli"
import { captureCliOutput } from "./test-helpers/capture-cli-output"

const cliPath = new URL("./korri-cli.ts", import.meta.url).pathname
const repoRoot = new URL("../../../..", import.meta.url).pathname

type FileTarget = Extract<
  NonNullable<LibraryReleasePayload["target"]>,
  { readonly kind: "file" }
>

function firstFileTargetFromLibraryYaml(yaml: string): FileTarget {
  const parsed = parse(yaml) as { readonly library?: Record<string, unknown> }
  const target = decodeLibraryItemPayload(parsed.library?.["metroid-fusion"])
    .releases[0]?.target
  if (target?.kind !== "file") throw new Error("expected first file target")
  return target
}

async function runCli(
  args: readonly string[],
  options: { readonly env?: Record<string, string | undefined> } = {},
) {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...options.env },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

function enableRetroarchDiscovery(): () => void {
  const previous = process.env.KORRI_ENABLED_PLUGINS
  process.env.KORRI_ENABLED_PLUGINS = KORRI_RETROARCH_PLUGIN_ID
  return () => {
    if (previous === undefined) delete process.env.KORRI_ENABLED_PLUGINS
    else process.env.KORRI_ENABLED_PLUGINS = previous
  }
}

function resolveFromPath(command: string): string {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    if (directory.length === 0) continue
    const candidate = join(directory, command)
    if (Bun.file(candidate).size !== 0) return candidate
  }
  throw new Error(`could not resolve ${command} from PATH`)
}

describe("korri CLI", () => {
  it("renders help for the root command", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["--help"]))

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("renders help for the artifacts command", async () => {
    const result = await captureCliOutput(() =>
      Effect.runPromiseExit(runKorriCli(["artifacts", "--help"])),
    )

    expect(result.stdout).toContain("Import and adopt Korri artifacts")
    expect(result.stdout).toContain("import-file")
    expect(result.stdout).toContain("import-staged")
  })

  it("renders help for the launch command", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["launch", "--help"]))

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("renders help for the scout scan releases command", async () => {
    const result = await captureCliOutput(() =>
      Effect.runPromiseExit(
        runKorriCli(["scout", "scan", "releases", "--help"]),
      ),
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Scan files under a root")
    expect(result.stdout).toContain("--root")
    expect(result.stdout).toContain("--storage")
    expect(result.stdout).toContain("--config")
  })

  it("scouts configured storage roots into an explicit config file", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-scout-configured-"))
    const previousConfigRoots = process.env.KORRI_CONFIG_ROOTS
    const previousFindBin = process.env.KORRI_FIND_BIN
    const restorePlugins = enableRetroarchDiscovery()
    try {
      const romRoot = join(root, "roms")
      const config = join(root, "korri.yaml")
      await mkdir(romRoot, { recursive: true })
      await writeFile(join(romRoot, "Metroid Fusion.gba"), "")
      await writeFile(
        config,
        ["storage:", "  sd-releases:", `    root: ${romRoot}`, ""].join("\n"),
      )
      delete process.env.KORRI_CONFIG_ROOTS
      process.env.KORRI_FIND_BIN = resolveFromPath("find")

      const result = await captureCliOutput(() =>
        Effect.runPromiseExit(
          runKorriCli(["scout", "scan", "configured", "--config", config]),
        ),
      )

      expect(result.exitCode).toBe(0)
      const summary = JSON.parse(result.stdout) as {
        readonly status: string
        readonly scanned: number
        readonly results: readonly [{ readonly status: string }]
      }
      expect(summary.status).toBe("ok")
      expect(summary.scanned).toBe(1)
      expect(summary.results[0]?.status).toBe("scanned")
      const generated = await readFile(config, "utf8")
      expect(generated).toContain("metroid-fusion")
      expect(firstFileTargetFromLibraryYaml(generated)).toMatchObject({
        storage: "sd-releases",
        path: "Metroid Fusion.gba",
        discovery: { "first-seen-at": expect.any(String) },
      })
    } finally {
      if (previousConfigRoots === undefined)
        delete process.env.KORRI_CONFIG_ROOTS
      else process.env.KORRI_CONFIG_ROOTS = previousConfigRoots
      if (previousFindBin === undefined) delete process.env.KORRI_FIND_BIN
      else process.env.KORRI_FIND_BIN = previousFindBin
      restorePlugins()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("scouts release candidates into the default config file", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-scout-releases-"))
    const dataHome = await mkdtemp(join(tmpdir(), "korri-scout-data-"))
    const previousDataHome = process.env.XDG_DATA_HOME
    const previousConfigRoots = process.env.KORRI_CONFIG_ROOTS
    const previousFindBin = process.env.KORRI_FIND_BIN
    const restorePlugins = enableRetroarchDiscovery()
    try {
      process.env.XDG_DATA_HOME = dataHome
      process.env.KORRI_FIND_BIN = resolveFromPath("find")
      delete process.env.KORRI_CONFIG_ROOTS
      await writeFile(join(root, "Metroid Fusion.gba"), "")
      const config = join(dataHome, "korri", "config", "korri.yaml")

      const result = await captureCliOutput(() =>
        Effect.runPromiseExit(
          runKorriCli([
            "scout",
            "scan",
            "releases",
            "--root",
            root,
            "--storage",
            "sd-releases",
          ]),
        ),
      )

      expect(result.exitCode).toBe(0)
      const summary = JSON.parse(result.stdout) as {
        readonly config: string
        readonly yaml: string
        readonly merge: { readonly libraryAdded: number }
      }
      expect(summary.yaml).toContain("metroid-fusion")
      expect(firstFileTargetFromLibraryYaml(summary.yaml)).toMatchObject({
        storage: "sd-releases",
        path: "Metroid Fusion.gba",
        discovery: { "first-seen-at": expect.any(String) },
      })
      expect(summary.yaml).not.toContain("Scout")
      expect(summary.config).toBe(config)
      expect(summary.merge.libraryAdded).toBe(1)
      const generated = await readFile(config, "utf8")
      expect(generated).toContain("storage:")
      expect(firstFileTargetFromLibraryYaml(generated)).toMatchObject({
        storage: "sd-releases",
        path: "Metroid Fusion.gba",
        discovery: { "first-seen-at": expect.any(String) },
      })

      const second = await captureCliOutput(() =>
        Effect.runPromiseExit(
          runKorriCli([
            "scout",
            "scan",
            "releases",
            "--root",
            root,
            "--storage",
            "sd-releases",
          ]),
        ),
      )
      const secondSummary = JSON.parse(second.stdout) as {
        readonly merge: {
          readonly storageSkipped: number
          readonly libraryAdded: number
          readonly librarySkipped: number
        }
      }
      expect(second.exitCode).toBe(0)
      expect(secondSummary.merge).toMatchObject({
        storageSkipped: 1,
        libraryAdded: 0,
        libraryDeduplicated: 1,
        identityBackfilled: 1,
        librarySkipped: 0,
      })
    } finally {
      if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previousDataHome
      if (previousConfigRoots === undefined)
        delete process.env.KORRI_CONFIG_ROOTS
      else process.env.KORRI_CONFIG_ROOTS = previousConfigRoots
      if (previousFindBin === undefined) delete process.env.KORRI_FIND_BIN
      else process.env.KORRI_FIND_BIN = previousFindBin
      restorePlugins()
      await rm(root, { recursive: true, force: true })
      await rm(dataHome, { recursive: true, force: true })
    }
  })

  it("reports unclaimed GBA files when RetroArch is not enabled for Scout", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-scout-unclaimed-root-"))
    const configRoot = await mkdtemp(
      join(tmpdir(), "korri-scout-unclaimed-config-"),
    )
    const previousFindBin = process.env.KORRI_FIND_BIN
    const previousEnabledPlugins = process.env.KORRI_ENABLED_PLUGINS
    try {
      const config = join(configRoot, "korri.yaml")
      await writeFile(join(root, "Metroid Fusion.gba"), "")
      delete process.env.KORRI_ENABLED_PLUGINS
      process.env.KORRI_FIND_BIN = resolveFromPath("find")

      const result = await captureCliOutput(() =>
        Effect.runPromiseExit(
          runKorriCli([
            "scout",
            "scan",
            "releases",
            "--root",
            root,
            "--storage",
            "sd-releases",
            "--config",
            config,
          ]),
        ),
      )

      expect(result.exitCode).toBe(0)
      const summary = JSON.parse(result.stdout) as {
        readonly report: {
          readonly candidates: number
          readonly unclaimed: number
        }
        readonly merge: { readonly libraryAdded: number }
        readonly yaml: string
      }
      expect(summary.report).toMatchObject({ candidates: 0, unclaimed: 1 })
      expect(summary.merge.libraryAdded).toBe(0)
      expect(summary.yaml).not.toContain("metroid-fusion")
    } finally {
      if (previousFindBin === undefined) delete process.env.KORRI_FIND_BIN
      else process.env.KORRI_FIND_BIN = previousFindBin
      if (previousEnabledPlugins === undefined)
        delete process.env.KORRI_ENABLED_PLUGINS
      else process.env.KORRI_ENABLED_PLUGINS = previousEnabledPlugins
      await rm(root, { recursive: true, force: true })
      await rm(configRoot, { recursive: true, force: true })
    }
  })

  it("deduplicates explicit release scans against an authored config entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-scout-dedupe-root-"))
    const configRoot = await mkdtemp(
      join(tmpdir(), "korri-scout-dedupe-config-"),
    )
    const previousFindBin = process.env.KORRI_FIND_BIN
    const restorePlugins = enableRetroarchDiscovery()
    try {
      const romRoot = join(root, "roms")
      const config = join(configRoot, "korri.yaml")
      await mkdir(join(romRoot, "gba"), { recursive: true })
      await writeFile(
        join(romRoot, "gba", "Metroid Fusion.gba"),
        "metroid-bytes",
      )
      await writeFile(
        config,
        [
          "storage:",
          "  sd-releases:",
          `    root: ${romRoot}`,
          "library:",
          "  metroid-fusion-authored:",
          "    title: Authored Metroid",
          "    releases:",
          "      - id: gba",
          "        system: gba",
          "        target:",
          "          kind: file",
          "          storage: sd-releases",
          "          path: gba/Metroid Fusion.gba",
          "",
        ].join("\n"),
      )
      process.env.KORRI_FIND_BIN = resolveFromPath("find")

      const result = await captureCliOutput(() =>
        Effect.runPromiseExit(
          runKorriCli([
            "scout",
            "scan",
            "releases",
            "--root",
            romRoot,
            "--storage",
            "sd-releases",
            "--config",
            config,
          ]),
        ),
      )

      expect(result.exitCode).toBe(0)
      const summary = JSON.parse(result.stdout) as {
        readonly report: { readonly deduplicated: number }
        readonly merge: {
          readonly libraryAdded: number
          readonly libraryDeduplicated: number
          readonly identityBackfilled: number
        }
      }
      expect(summary.report.deduplicated).toBe(1)
      expect(summary.merge).toMatchObject({
        libraryAdded: 0,
        libraryDeduplicated: 1,
        identityBackfilled: 1,
      })
      const generated = await readFile(config, "utf8")
      expect(generated).toContain("metroid-fusion-authored")
      expect(generated).not.toContain("metroid-fusion:")
      expect(generated).toContain("identity:")
    } finally {
      if (previousFindBin === undefined) delete process.env.KORRI_FIND_BIN
      else process.env.KORRI_FIND_BIN = previousFindBin
      restorePlugins()
      await rm(root, { recursive: true, force: true })
      await rm(configRoot, { recursive: true, force: true })
    }
  })

  it("reports explicit release merge conflicts as JSON diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-scout-conflict-root-"))
    const configRoot = await mkdtemp(
      join(tmpdir(), "korri-scout-conflict-config-"),
    )
    const previousFindBin = process.env.KORRI_FIND_BIN
    const restorePlugins = enableRetroarchDiscovery()
    try {
      const config = join(configRoot, "korri.yaml")
      await writeFile(join(root, "Metroid Fusion.gba"), "")
      await writeFile(
        config,
        ["storage:", "  sd-releases:", "    root: /different/root", ""].join(
          "\n",
        ),
      )
      process.env.KORRI_FIND_BIN = resolveFromPath("find")

      const result = await captureCliOutput(() =>
        Effect.runPromiseExit(
          runKorriCli([
            "scout",
            "scan",
            "releases",
            "--root",
            root,
            "--storage",
            "sd-releases",
            "--config",
            config,
          ]),
        ),
      )

      expect(result.exitCode).toBe(1)
      const diagnostic = JSON.parse(result.stdout) as {
        readonly status: string
        readonly reason: string
      }
      expect(diagnostic).toMatchObject({
        status: "diagnostic",
        reason: "MergeFailed",
      })
    } finally {
      if (previousFindBin === undefined) delete process.env.KORRI_FIND_BIN
      else process.env.KORRI_FIND_BIN = previousFindBin
      restorePlugins()
      await rm(root, { recursive: true, force: true })
      await rm(configRoot, { recursive: true, force: true })
    }
  })

  it("fails through the CLI framework for an unknown subcommand", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["does-not-exist"]))

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("lists and dry-runs enabled first-party plugin catalog games", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "korri-cli-plugin-"))
    const srb2Executable = executablePath(
      stateRoot,
      KORRI_SRB2_PLUGIN_ID,
      "srb2",
      "srb2",
    )
    await mkdir(join(srb2Executable, ".."), { recursive: true })
    await writeFile(srb2Executable, "#!/bin/sh\necho srb2\n")
    await chmod(srb2Executable, 0o755)

    const env = {
      KORRI_CONFIG_ROOTS: "",
      KORRI_ENABLED_PLUGINS: KORRI_SRB2_PLUGIN_ID,
      KORRI_PLUGIN_RESOURCE_ROOT: stateRoot,
    }

    const list = await runCli(["games", "list"], { env })
    expect(list.exitCode).toBe(0)
    expect(list.stderr).toBe("")
    expect(list.stdout).toContain("@korri:srb2/srb2\tSonic Robo Blast 2")

    const dryRun = await runCli(["launch", "dry-run", "@korri:srb2/srb2"], {
      env,
    })
    expect(dryRun.exitCode).toBe(0)
    expect(dryRun.stderr).toBe("")
    expect(dryRun.stdout).toContain("dry-run ok: @korri:srb2/srb2")
    expect(dryRun.stdout).toContain(`command: ${srb2Executable}`)
  })

  it("lists and finds games through KorriControl", async () => {
    const result = await captureCliOutput(() =>
      Effect.runPromiseExit(
        runKorriCliWithLayer(["games", "list"], controlLayer()),
      ),
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("snes/echo.smc\tEcho Runner")

    const found = await captureCliOutput(() =>
      Effect.runPromiseExit(
        runKorriCliWithLayer(["games", "find", "Echo"], controlLayer()),
      ),
    )

    expect(found.exitCode).toBe(0)
    expect(found.stdout).toContain("snes/echo.smc\tEcho Runner")
  })

  it("reports unavailable games list as host unavailable", async () => {
    const result = await captureCliOutput(() =>
      Effect.runPromiseExit(
        runKorriCliWithLayer(
          ["games", "list"],
          controlLayer({
            listGames: () =>
              Effect.succeed({
                _tag: "ListGamesUnavailable",
                message: "offline",
              }),
          }),
        ),
      ),
    )

    expect(result.exitCode).toBe(5)
    expect(result.stdout).toContain("games unavailable: offline")
  })

  it("renders ambiguous find results as an ambiguous failure", async () => {
    const result = await captureCliOutput(() =>
      Effect.runPromiseExit(
        runKorriCliWithLayer(
          ["games", "find", "echo"],
          controlLayer({
            findGame: () =>
              Effect.succeed({
                _tag: "AmbiguousGame",
                query: "echo",
                candidates: [
                  { id: "snes/echo.smc", title: "Echo Runner" },
                  { id: "snes/echo-2.smc", title: "Echo Runner 2" },
                ],
              }),
          }),
        ),
      ),
    )

    expect(result.exitCode).toBe(4)
    expect(result.stdout).toContain("ambiguous game query: echo")
    expect(result.stdout).toContain("snes/echo-2.smc")
  })

  it("dry-runs a launch through KorriControl without using stream launch intents", async () => {
    const result = await captureCliOutput(() =>
      Effect.runPromiseExit(
        runKorriCliWithLayer(
          ["launch", "dry-run", "snes/echo.smc", "--profile-id", "default"],
          controlLayer(),
        ),
      ),
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry-run ok: snes/echo.smc")
    expect(result.stdout).toContain("command: echo hello")
    expect(result.stdout).toContain("readiness: ready (idle)")
  })
})

const spec: LaunchSpec = { command: "echo", args: ["hello"] }
const playable: PlayableLibraryEntry = {
  id: "snes/echo.smc",
  itemId: "snes/echo.smc",
  title: "Echo Runner",
  launchable: true,
  releases: [{ id: "default", system: "snes", launchable: true }],
}

function controlLayer(
  overrides: Partial<KorriControlService> = {},
): Layer.Layer<KorriControl> {
  return Layer.succeed(KorriControl)({
    listGames: () => Effect.succeed({ _tag: "GamesListed", games: [playable] }),
    findGame: () =>
      Effect.succeed({
        _tag: "GameFound",
        game: playable,
        match: "title",
      }),
    dryRunLaunch: request =>
      Effect.succeed({
        _tag: "LaunchDryRunOk",
        selection: {
          id: request.id,
          ...(request.profileId ? { profileId: request.profileId } : {}),
        },
        spec,
        readiness: { _tag: "SessionReady", mode: "idle" },
        caveats: [],
      }),
    launchGame: request =>
      Effect.succeed({ _tag: "Launched", selection: { id: request.id } }),
    sessionStatus: () => Effect.succeed({ _tag: "SessiondNotConfigured" }),
    stopSession: () => Effect.succeed({ _tag: "NothingToStop" }),
    daemonStatus: () =>
      Effect.succeed({
        _tag: "DaemonAvailable",
        serverId: "test",
        displayName: "Test",
      }),
    streamRuntimeSettingsStatus: () =>
      Effect.succeed({
        _tag: "StreamRuntimeSettingsUnavailable",
        message: "not configured",
      }),
    ...overrides,
  })
}
