import { describe, expect, it } from "bun:test"
import { Effect, Exit } from "effect"
import { runKorriCli } from "../korri-cli"

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
  ]) {
    it(`renders help for bazzar ${command}`, async () => {
      const result = await runCli(["bazzar", command, "--help"])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(command)
      expect(result.stderr).toBe("")
    })
  }

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
    const result = await runCli(["bazzar", "search", "fixture-query"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("No results found\n")
    expect(result.stderr).toBe("")
  })

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
      exitCode: number
      data: { outcomes: Array<{ source: { plugin: string } }> }
    }
    expect(result.exitCode).toBe(envelope.exitCode)
    expect(envelope.exitCode).toBe(10)
    expect(envelope.contractVersion).toBe("bazzar.source-adapter.v1")
    expect(envelope.command).toBe("validate-sources")
    expect(envelope.data.outcomes.length).toBeGreaterThan(0)
    expect(
      envelope.data.outcomes.map(outcome => outcome.source.plugin),
    ).not.toContain("coolrom")
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
