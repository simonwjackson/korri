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
})
