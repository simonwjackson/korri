import { describe, expect, it } from "bun:test"
import { resolve } from "node:path"

const SCRIPT = resolve(import.meta.dir, "fake-game.sh")

async function run(args: readonly string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn({
    cmd: [SCRIPT, ...args],
    env: { ...process.env, ...env },
    stderr: "pipe",
    stdout: "pipe",
  })
  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  const stdout = await new Response(proc.stdout).text()
  return { exitCode, stderr, stdout }
}

describe("tools/testing/fake-game.sh", () => {
  it("exits 0 by default and echoes argv on stderr", async () => {
    const { exitCode, stderr, stdout } = await run([
      "/roms/snes/zelda.smc",
      "-Psnes",
      "--core=snes9x",
      "--emulator=retroarch",
    ])

    expect(exitCode).toBe(0)
    expect(stdout).toBe("")
    expect(stderr).toContain(
      "fake-game launched with: /roms/snes/zelda.smc -Psnes --core=snes9x --emulator=retroarch",
    )
    expect(stderr).toContain("argv: /roms/snes/zelda.smc")
    expect(stderr).toContain("argv: -Psnes")
    expect(stderr).toContain("argv: --core=snes9x")
    expect(stderr).toContain("argv: --emulator=retroarch")
  })

  it("honors KORRI_FAKE_GAME_EXIT for arbitrary non-zero codes", async () => {
    const { exitCode, stderr } = await run([], { KORRI_FAKE_GAME_EXIT: "42" })

    expect(exitCode).toBe(42)
    expect(stderr).toContain("fake-game launched with:")
  })

  it("treats the empty arg list correctly (no argv lines, exit 0)", async () => {
    const { exitCode, stderr } = await run([])

    expect(exitCode).toBe(0)
    expect(stderr).toContain("fake-game launched with: ")
    expect(stderr).not.toContain("argv:")
  })

  it("preserves arguments containing spaces as a single token", async () => {
    const { stderr } = await run(["a b c", "next"])

    // Each argv: line corresponds to one shell-level argument.
    const argvLines = stderr
      .split("\n")
      .filter(line => line.startsWith("argv: "))
    expect(argvLines).toEqual(["argv: a b c", "argv: next"])
  })
})
