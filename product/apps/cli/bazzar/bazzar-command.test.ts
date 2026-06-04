import { describe, expect, it } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import { makeInMemoryAcquisitionLayer } from "@platform/acquisition/acquisition-service"
import { Effect, Exit } from "effect"
import { Command } from "effect/unstable/cli"
import { runKorriCli } from "../korri-cli"
import { captureCliOutput } from "../test-helpers/capture-cli-output"
import { bazzarCommand } from "./bazzar-command"

const cliPath = new URL("../korri-cli.ts", import.meta.url).pathname

async function runCli(args: readonly string[]) {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

function parseSingleJsonLine(stdout: string): unknown {
  const lines = stdout.trimEnd().split("\n")
  expect(lines).toHaveLength(1)
  return JSON.parse(lines[0] ?? "")
}

function expectFinalDownloadEnvelope(
  result: Awaited<ReturnType<typeof runCli>>,
  expected: { readonly name: string; readonly url: string },
) {
  expect(result.stderr).toBe("")
  const envelope = parseSingleJsonLine(result.stdout) as {
    command: string
    exitCategory: string
    exitCode: number
    data: {
      outcome: {
        status: string
        artifact: { final: boolean; name: string; url: string }
      }
    }
  }
  expect(result.exitCode).toBe(0)
  expect(envelope.command).toBe("resolve-download")
  expect(envelope.exitCategory).toBe("success")
  expect(envelope.exitCode).toBe(0)
  expect(envelope.data.outcome.status).toBe("final_artifact")
  expect(envelope.data.outcome.artifact).toMatchObject({
    final: true,
    ...expected,
  })
}

function expectSourceFailureEnvelope(
  result: Awaited<ReturnType<typeof runCli>>,
  expected: Record<string, unknown>,
) {
  expect(result.stderr).toBe("")
  const envelope = parseSingleJsonLine(result.stdout) as {
    command: string
    exitCategory: string
    exitCode: number
    data: { outcome: Record<string, unknown> }
  }
  expect(result.exitCode).toBe(11)
  expect(envelope.command).toBe("resolve-download")
  expect(envelope.exitCategory).toBe("source_failure")
  expect(envelope.exitCode).toBe(11)
  expect(envelope.data.outcome).toMatchObject(expected)
}

describe("korri bazzar command routing", () => {
  it("renders help for the bazzar command group", async () => {
    const result = await runCli(["bazzar", "--help"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Game Bazaar - Multi-source Game Search")
    expect(result.stdout).toContain("search")
    expect(result.stdout).toContain("validate-sources")
    expect(result.stderr).toBe("")
  })

  for (const command of [
    "search",
    "details",
    "plugins",
    "validate-sources",
    "resolve-download",
    "acquire",
  ]) {
    it(`renders help for bazzar ${command}`, async () => {
      const result = await runCli(["bazzar", command, "--help"])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(command)
      expect(result.stderr).toBe("")
    })
  }

  for (const [command, flags] of [
    [
      "search",
      [
        "--format",
        "--platforms",
        "--sources",
        "--interactive",
        "--cache",
        "--cursor",
        "--timeout",
        "--filter",
        "--strict",
        "--validate",
        "--log-level",
        "--log-json",
      ],
    ],
    ["details", ["--format", "--cache", "--log-level", "--log-json"]],
    ["plugins", ["--format", "--log-level", "--log-json"]],
    [
      "validate-sources",
      ["--sources", "--timeout", "--log-level", "--log-json"],
    ],
    ["acquire", ["--log-level", "--log-json"]],
    [
      "resolve-download",
      [
        "--title",
        "--site",
        "--file-name",
        "--size",
        "--artifact-format",
        "--log-level",
        "--log-json",
      ],
    ],
  ] as const) {
    it(`preserves important Bazzar flags for ${command}`, async () => {
      const result = await runCli(["bazzar", command, "--help"])

      expect(result.exitCode).toBe(0)
      for (const flag of flags) {
        expect(result.stdout).toContain(flag)
      }
      expect(result.stderr).toBe("")
    })
  }

  it("acquires a source-native artifact as staged JSON without library writes", async () => {
    const layer = makeInMemoryAcquisitionLayer({
      search: () => Effect.succeed({ candidates: [] }),
      details: () => Effect.die("unused"),
      detailsByUrl: () => Effect.die("unused"),
      plugins: () => Effect.succeed({ plugins: [] }),
      validateSources: () => Effect.succeed({ sources: [] }),
      resolveDownload: () => Effect.die("unused"),
      acquireArtifact: () =>
        Effect.succeed({
          id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          kind: "content",
          system: "smbr",
          format: { id: "smbr-level" },
          file: { name: "level.lvl", extension: "lvl" },
          stagedPath: "/tmp/korri/acquisition/level.lvl",
          digests: {
            sha256:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
          sourceData: { "fixture-source.v1": { id: "level-1" } },
        }),
    })

    const result = await captureCliOutput(() =>
      Effect.runPromise(
        Command.runWith(bazzarCommand, { version: "test" })([
          "acquire",
          "fixture-source",
          "level-1",
        ]).pipe(Effect.provide(layer), Effect.provide(BunServices.layer)),
      ),
    )

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const envelope = parseSingleJsonLine(result.stdout) as {
      command: string
      data: {
        artifact: {
          id: string
          stagedPath: string
          system: string
          format: { id: string }
          digests: { sha256: string }
        }
        lifecycle: Record<string, unknown>
      }
    }
    expect(envelope.command).toBe("acquire")
    expect(envelope.data.artifact).toMatchObject({
      id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      stagedPath: "/tmp/korri/acquisition/level.lvl",
      system: "smbr",
      format: { id: "smbr-level" },
    })
    expect(envelope.data.artifact.digests.sha256).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    expect(envelope.data.lifecycle).toMatchObject({
      staged: true,
      durable: false,
      launched: false,
    })
    expect(envelope.data).not.toHaveProperty("game")
    expect(envelope.data).not.toHaveProperty("libraryRecord")
    expect(envelope.data).not.toHaveProperty("launchSpec")
  })

  it("requires resolve-download title flag for Bazzar compatibility", async () => {
    const exit = await Effect.runPromiseExit(
      runKorriCli([
        "bazzar",
        "resolve-download",
        "fixture-source",
        "https://example.com/game.zip",
      ]),
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("fails through the CLI framework for an unknown bazzar subcommand", async () => {
    const exit = await Effect.runPromiseExit(
      runKorriCli(["bazzar", "does-not-exist"]),
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("lists active Korri acquisition plugins without quarantined providers", async () => {
    const result = await runCli(["bazzar", "plugins", "--format", "json"])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).not.toContain("not wired yet")
    const plugins = JSON.parse(result.stdout) as Array<{ sourceName: string }>
    expect(plugins.map(plugin => plugin.sourceName)).toContain("chip8archive")
    expect(plugins.map(plugin => plugin.sourceName)).not.toContain("coolrom")
    expect(plugins.map(plugin => plugin.sourceName)).not.toContain("retrostic")
    expect(plugins.map(plugin => plugin.sourceName)).not.toContain("romhustler")
    expect(plugins.map(plugin => plugin.sourceName)).not.toContain(
      "steamgriddb",
    )
    expect(plugins.map(plugin => plugin.sourceName)).not.toContain("wowroms")
  })

  it("supports Bazzar plugin jsonl and tsv output formats", async () => {
    const jsonl = await runCli(["bazzar", "plugins", "--format", "jsonl"])
    expect(jsonl.exitCode).toBe(0)
    const firstJsonlLine = jsonl.stdout.trimEnd().split("\n")[0]
    expect(JSON.parse(firstJsonlLine ?? "{}").sourceName).toBe("chip8archive")

    const tsv = await runCli(["bazzar", "plugins", "--format", "tsv"])
    expect(tsv.exitCode).toBe(0)
    expect(tsv.stdout.split("\n")[0]).toContain("sourceName\tpluginName")
  })

  it("runs search through the acquisition service with Bazzar no-results output", async () => {
    const result = await runCli([
      "bazzar",
      "search",
      "fixture-query",
      "--sources",
      "chip8archive",
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("No results found\n")
    expect(result.stderr).toBe("")
  })

  it("filters source-backed search results by requested platform", async () => {
    const result = await runCli([
      "bazzar",
      "search",
      "2048",
      "--sources",
      "homebrewhub",
      "--platforms",
      "pico8",
      "--format",
      "json",
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toBe("No results found\n")
  })

  it("applies platform filters to chip8archive search results", async () => {
    const result = await runCli([
      "bazzar",
      "search",
      "wonky",
      "--sources",
      "chip8archive",
      "--platforms",
      "nintendo-nes",
      "--format",
      "json",
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toBe("No results found\n")
  })

  it("returns source-backed search results from approved TypeScript providers", async () => {
    const result = await runCli([
      "bazzar",
      "search",
      "wonky",
      "--sources",
      "chip8archive",
      "--format",
      "json",
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const candidates = JSON.parse(result.stdout) as Array<{
      sourceName: string
      id: string
      title: string
      url: string
      platform: string
    }>
    expect(candidates).toEqual([
      expect.objectContaining({
        sourceName: "chip8archive",
        id: "wonkypong",
        title: "Wonky Pong",
        platform: "xochip",
      }),
    ])
  })

  const approvedProviderCases = [
    {
      sourceName: "homebrewhub",
      query: "basil termini",
      platform: "nintendo-gameboy-advance",
      id: "basil-termini_2048-advance",
      title: "2048 Advance",
      locator: "homebrewhub:basil-termini_2048-advance",
      url: "https://hh3.gbdev.io/api/entry/basil-termini_2048-advance.json",
      filename: "2048 jam.gba",
      artifactUrl:
        "https://hh3.gbdev.io/static/database-gba/entries/basil-termini_2048-advance/files/2048%20jam.gba",
    },
    {
      sourceName: "pico8bbs",
      query: "celeste",
      platform: "pico8",
      id: "101",
      title: "Celeste Classic",
      locator: "pico8bbs:101",
      url: "https://www.lexaloffle.com/bbs/?tid=101",
      filename: "celeste-classic.p8.png",
      artifactUrl:
        "https://www.lexaloffle.com/bbs/cposts/1/celeste-classic.p8.png",
    },
    {
      sourceName: "portmaster",
      query: "keys",
      platform: "linux-port",
      id: "akeyspath.zip",
      title: "A Key(s) Path",
      locator: "portmaster:akeyspath",
      url: "https://portmaster.games/detail.html?name=akeyspath",
      filename: "akeyspath.zip",
      artifactUrl:
        "https://github.com/PortsMaster/PortMaster-Games/releases/download/2025-06-24_0854/akeyspath.zip",
    },
    {
      sourceName: "puzzlescript",
      query: "atlas",
      platform: "puzzlescript",
      id: "6994394",
      title: "Atlas Shrank",
      locator: "puzzlescript:6994394",
      url: "https://www.puzzlescript.net/play.html?p=6994394",
      filename: "atlas-shrank.pz",
      artifactUrl:
        "https://gist.githubusercontent.com/anonymous/6994394/raw/e2ca4d17e93996a1e5ba576c29bdd9746cad1d1e/script.txt",
    },
    {
      sourceName: "retrobrews",
      query: "ambushed",
      platform: "nintendo-nes",
      id: "nes-games:ambushed.nes",
      title: "Ambushed",
      locator: "retrobrews:nes-games:ambushed.nes",
      url: "https://github.com/retrobrews/nes-games/blob/master/ambushed.nes",
      filename: "ambushed.nes",
      artifactUrl:
        "https://raw.githubusercontent.com/retrobrews/nes-games/master/ambushed.nes",
    },
    {
      sourceName: "tic80gallery",
      query: "2048",
      platform: "tic80",
      id: "395",
      title: "2048 (TIC-80 Version)",
      locator: "tic80gallery:395",
      url: "https://tic80.com/play?cart=395",
      filename: "2048_tic_80_version.tic",
      artifactUrl:
        "https://tic80.com/cart/68d5e7881289837510df0e8c080bea73/2048_tic_80_version.tic",
    },
    {
      sourceName: "wasm4gallery",
      query: "snake",
      platform: "wasm4",
      id: "snake",
      title: "Snake",
      locator: "wasm4gallery:snake",
      url: "https://wasm4.org/play/snake",
      filename: "snake.wasm",
      artifactUrl: "https://wasm4.org/carts/snake.wasm",
    },
  ] as const

  for (const provider of approvedProviderCases) {
    it(`returns source-backed ${provider.sourceName} search results`, async () => {
      const result = await runCli([
        "bazzar",
        "search",
        provider.query,
        "--sources",
        provider.sourceName,
        "--platforms",
        provider.platform,
        "--format",
        "json",
      ])

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe("")
      const candidates = JSON.parse(result.stdout) as Array<{
        sourceName: string
        id: string
        title: string
        platform: string
      }>
      expect(candidates).toContainEqual(
        expect.objectContaining({
          sourceName: provider.sourceName,
          id: provider.id,
          title: provider.title,
          platform: provider.platform,
        }),
      )
    })

    it(`returns source-backed ${provider.sourceName} details for locators and URLs`, async () => {
      for (const input of [provider.locator, provider.url]) {
        const result = await runCli(["bazzar", "details", input])

        expect(result.exitCode).toBe(0)
        expect(result.stderr).toBe("")
        const details = JSON.parse(result.stdout) as {
          sourceName: string
          id: string
          title: string
        }
        expect(details).toMatchObject({
          sourceName: provider.sourceName,
          id: provider.id,
          title: provider.title,
        })
      }
    })

    it(`emits ${provider.sourceName} final downloads as exactly one contract JSON line`, async () => {
      const result = await runCli([
        "bazzar",
        "resolve-download",
        provider.sourceName,
        provider.url,
        "--title",
        provider.title,
      ])

      expectFinalDownloadEnvelope(result, {
        name: provider.filename,
        url: provider.artifactUrl,
      })
    })
  }

  it("keeps credential-gated itch.io safe without credentials", async () => {
    const plugins = JSON.parse(
      (await runCli(["bazzar", "plugins", "--format", "json"])).stdout,
    ) as Array<{ sourceName: string; credentialRequired: boolean }>
    expect(plugins).toContainEqual(
      expect.objectContaining({
        sourceName: "itchio",
        credentialRequired: true,
      }),
    )

    const details = await runCli(["bazzar", "details", "itchio:creator/game"])
    expect(details.exitCode).toBe(21)
    expect(details.stdout).toBe("")
    expect(details.stderr).toContain("Unknown itchio candidate")
    expect(details.stderr).not.toContain("not wired yet")

    const resolution = await runCli([
      "bazzar",
      "resolve-download",
      "itchio",
      "https://creator.itch.io/game",
      "--title",
      "itch.io Game",
    ])
    expectSourceFailureEnvelope(resolution, {
      status: "access_required",
      reason: "requires-user-action",
      handoffUrl: "https://creator.itch.io/game",
    })
  })

  it("emits source-backed not-found downloads as contract source failures", async () => {
    const result = await runCli([
      "bazzar",
      "resolve-download",
      "portmaster",
      "https://portmaster.games/detail.html?name=no-such-game",
      "--title",
      "Missing Port",
    ])

    expectSourceFailureEnvelope(result, {
      status: "blocked_unavailable",
      reason: "Unknown portmaster candidate: no-such-game.zip",
    })
  })

  it("emits unsupported outcomes for unrecognized source URLs", async () => {
    const result = await runCli([
      "bazzar",
      "resolve-download",
      "homebrewhub",
      "https://unrelated.example.com/game.rom",
      "--title",
      "Unrelated Game",
    ])

    expectSourceFailureEnvelope(result, {
      status: "unsupported",
      reason: "unsupported",
      handoffUrl: "https://unrelated.example.com/game.rom",
    })
  })

  it("emits source-backed missing artifact links as non-final contract outcomes", async () => {
    const result = await runCli([
      "bazzar",
      "resolve-download",
      "tic80gallery",
      "https://tic80.com/play?cart=4676",
      "--title",
      "Ladders & Dragons",
    ])

    expectSourceFailureEnvelope(result, {
      status: "unsupported",
      reason: "unsupported",
      handoffUrl: "https://tic80.com/play?cart=4676",
    })
  })

  it("emits source-backed blocked downloads as contract source failures", async () => {
    const result = await runCli([
      "bazzar",
      "resolve-download",
      "homebrewhub",
      "https://hh3.gbdev.io/api/entry/disabled-downloads.json",
      "--title",
      "Disabled Downloads",
    ])

    expectSourceFailureEnvelope(result, {
      status: "blocked_unavailable",
      reason: "Homebrew Hub entry has disabled downloads",
    })
  })

  for (const candidateUrl of [
    "chip8archive:wonkypong",
    "https://johnearnest.github.io/chip8Archive/play.html?p=wonkypong",
    "https://raw.githubusercontent.com/JohnEarnest/chip8Archive/master/roms/wonkypong.ch8",
  ]) {
    it(`returns source-backed details for Bazzar-compatible candidate URL ${candidateUrl}`, async () => {
      const result = await runCli(["bazzar", "details", candidateUrl])

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe("")
      const details = JSON.parse(result.stdout) as {
        sourceName: string
        id: string
        title: string
        description: string
      }
      expect(details).toMatchObject({
        sourceName: "chip8archive",
        id: "wonkypong",
        title: "Wonky Pong",
        description: "Pong, but wonky. Made for Octojam IV.",
      })
    })
  }

  for (const unknownChip8Input of [
    "chip8archive:does-not-exist",
    "https://johnearnest.github.io/chip8Archive/play.html?p=no-such-game",
  ]) {
    it(`reports unknown source-backed CHIP-8 detail IDs for ${unknownChip8Input}`, async () => {
      const result = await runCli(["bazzar", "details", unknownChip8Input])

      expect(result.exitCode).toBe(21)
      expect(result.stdout).toBe("")
      expect(result.stderr).toContain("Unknown CHIP-8 Archive candidate.")
      expect(result.stderr).not.toContain("not wired yet")
    })
  }

  it("reports unsupported details URLs without the old not-wired stub", async () => {
    const result = await runCli([
      "bazzar",
      "details",
      "https://example.com/game",
    ])

    expect(result.exitCode).toBe(21)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain(
      "No plugin found that can handle URL: https://example.com/game",
    )
    expect(result.stderr).not.toContain("not wired yet")
  })

  it("emits validate-sources as exactly one contract JSON line", async () => {
    const result = await runCli(["bazzar", "validate-sources"])

    expect(result.stderr).toBe("")
    const envelope = parseSingleJsonLine(result.stdout) as {
      command: string
      contractVersion: string
      exitCategory: string
      exitCode: number
      data: { outcomes: Array<{ source: { plugin: string } }> }
    }
    expect(result.exitCode).toBe(envelope.exitCode)
    expect([
      ["success", 0],
      ["partial_degradation", 10],
    ]).toContainEqual([envelope.exitCategory, envelope.exitCode])
    expect(envelope.contractVersion).toBe("bazzar.source-adapter.v1")
    expect(envelope.command).toBe("validate-sources")
    expect(envelope.data.outcomes.length).toBeGreaterThan(0)
    expect(
      envelope.data.outcomes.map(outcome => outcome.source.plugin),
    ).not.toContain("coolrom")
  })

  it("emits validate-sources success as exactly one contract JSON line", async () => {
    const result = await runCli([
      "bazzar",
      "validate-sources",
      "--sources",
      "chip8archive",
    ])

    expect(result.stderr).toBe("")
    const envelope = parseSingleJsonLine(result.stdout) as {
      command: string
      exitCategory: string
      exitCode: number
      data: { outcomes: Array<{ source: { plugin: string }; status: string }> }
    }
    expect(result.exitCode).toBe(0)
    expect(envelope.command).toBe("validate-sources")
    expect(envelope.exitCategory).toBe("success")
    expect(envelope.exitCode).toBe(0)
    expect(envelope.data.outcomes).toEqual([
      expect.objectContaining({
        source: { plugin: "chip8archive", site: "chip8archive" },
        status: "healthy",
      }),
    ])
  })

  it("emits validate-sources caller errors as exactly one contract JSON line", async () => {
    const result = await runCli([
      "bazzar",
      "validate-sources",
      "--sources",
      "missing-source",
    ])

    expect(result.stderr).toBe("")
    const envelope = parseSingleJsonLine(result.stdout) as {
      command: string
      contractVersion: string
      exitCategory: string
      exitCode: number
      data: { outcomes: Array<{ source: { plugin: string }; status: string }> }
    }
    expect(result.exitCode).toBe(21)
    expect(envelope.contractVersion).toBe("bazzar.source-adapter.v1")
    expect(envelope.command).toBe("validate-sources")
    expect(envelope.exitCategory).toBe("caller_error")
    expect(envelope.exitCode).toBe(21)
    expect(envelope.data.outcomes).toEqual([
      expect.objectContaining({
        source: { plugin: "missing-source", site: "missing-source" },
        status: "caller_error",
      }),
    ])
  })

  it("emits resolve-download final artifacts as exactly one contract JSON line", async () => {
    const result = await runCli([
      "bazzar",
      "resolve-download",
      "chip8archive",
      "https://johnearnest.github.io/chip8Archive/play.html?p=wonkypong",
      "--title",
      "Wonky Pong",
    ])

    expectFinalDownloadEnvelope(result, {
      name: "wonkypong.ch8",
      url: "https://raw.githubusercontent.com/JohnEarnest/chip8Archive/master/roms/wonkypong.ch8",
    })
  })

  it("emits resolve-download not-found states as exactly one contract JSON line", async () => {
    const result = await runCli([
      "bazzar",
      "resolve-download",
      "chip8archive",
      "https://johnearnest.github.io/chip8Archive/play.html?p=no-such-game",
      "--title",
      "Missing CHIP-8 Game",
    ])

    expectSourceFailureEnvelope(result, {
      status: "blocked_unavailable",
      reason: "Unknown CHIP-8 Archive candidate: no-such-game",
    })
  })

  it("emits resolve-download non-final unsupported states as exactly one contract JSON line", async () => {
    const result = await runCli([
      "bazzar",
      "resolve-download",
      "chip8archive",
      "https://example.com/game.zip",
      "--title",
      "Fixture Game",
    ])

    expectSourceFailureEnvelope(result, {
      status: "unsupported",
      reason: "unsupported",
      handoffUrl: "https://example.com/game.zip",
    })
  })

  it("emits resolve-download caller errors as exactly one contract JSON line", async () => {
    const result = await runCli([
      "bazzar",
      "resolve-download",
      "missing-source",
      "https://example.com/game.zip",
      "--title",
      "Fixture Game",
    ])

    expect(result.stderr).toBe("")
    const envelope = parseSingleJsonLine(result.stdout) as {
      command: string
      contractVersion: string
      exitCategory: string
      exitCode: number
      data: {
        outcome: { source: { plugin: string }; status: string; reason: string }
      }
    }
    expect(result.exitCode).toBe(21)
    expect(envelope.contractVersion).toBe("bazzar.source-adapter.v1")
    expect(envelope.command).toBe("resolve-download")
    expect(envelope.exitCategory).toBe("caller_error")
    expect(envelope.exitCode).toBe(21)
    expect(envelope.data.outcome.source.plugin).toBe("missing-source")
    expect(envelope.data.outcome.status).toBe("caller_error")
    expect(envelope.data.outcome.reason).toContain("Unknown source")
  })
})
