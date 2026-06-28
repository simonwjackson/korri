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
import type { LaunchSpec } from "@platform/library/launcher"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { executablePath } from "@platform/plugin/resources"
import { KORRI_SRB2_PLUGIN_ID } from "@product/plugins/srb2"
import { Effect, Exit, Layer } from "effect"
import { runKorriCli, runKorriCliWithLayer } from "./korri-cli"
import { captureCliOutput } from "./test-helpers/capture-cli-output"

const cliPath = new URL("./korri-cli.ts", import.meta.url).pathname
const repoRoot = new URL("../../../..", import.meta.url).pathname

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

  it("renders help for the play command", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["play", "--help"]))

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("renders help for the stream launch command", async () => {
    const exit = await Effect.runPromiseExit(
      runKorriCli(["stream", "launch", "--help"]),
    )

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

  it("scouts release candidates into the default config file", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-scout-releases-"))
    const dataHome = await mkdtemp(join(tmpdir(), "korri-scout-data-"))
    const previousDataHome = process.env.XDG_DATA_HOME
    const previousConfigRoots = process.env.KORRI_CONFIG_ROOTS
    try {
      process.env.XDG_DATA_HOME = dataHome
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
      expect(result.stdout).toContain("scout release candidates")
      expect(result.stdout).toContain("metroid-fusion")
      expect(result.stdout).toContain(config)
      const generated = await readFile(config, "utf8")
      expect(generated).toContain("storage:")
      expect(generated).toContain("path: Metroid Fusion.gba")
    } finally {
      if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previousDataHome
      if (previousConfigRoots === undefined)
        delete process.env.KORRI_CONFIG_ROOTS
      else process.env.KORRI_CONFIG_ROOTS = previousConfigRoots
      await rm(root, { recursive: true, force: true })
      await rm(dataHome, { recursive: true, force: true })
    }
  })

  it("renders help for the stream remote-launch command", async () => {
    const exit = await Effect.runPromiseExit(
      runKorriCli(["stream", "remote-launch", "--help"]),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("fails through the CLI framework for an unknown subcommand", async () => {
    const exit = await Effect.runPromiseExit(runKorriCli(["does-not-exist"]))

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("reports missing stream runtime location as a prepare failure", async () => {
    const previousExitCode = process.exitCode
    const previousIntentPath = process.env.KORRI_GAME_STREAM_INTENT_PATH
    const previousRuntimeDir = process.env.XDG_RUNTIME_DIR
    const previousError = console.error
    const errors: string[] = []

    process.exitCode = undefined
    delete process.env.KORRI_GAME_STREAM_INTENT_PATH
    delete process.env.XDG_RUNTIME_DIR
    console.error = (line?: unknown) => {
      errors.push(String(line))
    }

    try {
      const exit = await Effect.runPromiseExit(
        runKorriCli(["stream", "launch", "snes/f-zero.smc"]),
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(Number(process.exitCode)).toBe(6)
      expect(errors.join("\n")).toContain(
        "KORRI_GAME_STREAM_INTENT_PATH or XDG_RUNTIME_DIR is required for launch intents",
      )
    } finally {
      console.error = previousError
      process.exitCode = previousExitCode ?? 0
      if (previousIntentPath === undefined) {
        delete process.env.KORRI_GAME_STREAM_INTENT_PATH
      } else {
        process.env.KORRI_GAME_STREAM_INTENT_PATH = previousIntentPath
      }
      if (previousRuntimeDir === undefined) delete process.env.XDG_RUNTIME_DIR
      else process.env.XDG_RUNTIME_DIR = previousRuntimeDir
    }
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

    expect(result.exitCode).toBe(124)
    expect(result.stdout).toContain("games unavailable: offline")
  })

  it("renders ambiguous find results as a usage failure", async () => {
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

    expect(result.exitCode).toBe(64)
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

  it("launches a game through KorriControl", async () => {
    const result = await captureCliOutput(() =>
      Effect.runPromiseExit(
        runKorriCliWithLayer(["launch", "snes/echo.smc"], controlLayer()),
      ),
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("launched: snes/echo.smc")
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
