import { describe, expect, it } from "bun:test"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

import { createShellLauncher } from "./shell-launcher"

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FAKE_GAME = resolve(REPO_ROOT, "tools", "testing", "fake-game.sh")

describe("createShellLauncher (real Bun.spawn)", () => {
  // /bin/sh is the one POSIX-blessed path that exists on every target this
  // launcher must run on (NixOS dev box, ROCKNIX device, CI Linux, macOS),
  // so we use it as the universal harness for synthetic exit-code tests.
  // /bin/true and /bin/false do not exist on plain NixOS.
  it("returns { status: 'launched' } for a process that exits 0", async () => {
    const launcher = createShellLauncher()
    const result = await launcher.run({
      command: "/bin/sh",
      args: ["-c", "exit 0"],
    })
    expect(result).toEqual({ status: "launched" })
  })

  it("returns { status: 'failed', exitCode: 1 } for a process that exits 1", async () => {
    const launcher = createShellLauncher()
    const result = await launcher.run({
      command: "/bin/sh",
      args: ["-c", "exit 1"],
    })
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(1)
    }
  })

  it("captures stderr tail on failure", async () => {
    const launcher = createShellLauncher()
    const result = await launcher.run({
      command: "/bin/sh",
      args: ["-c", "echo boom 1>&2; exit 7"],
    })
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(7)
      expect(result.stderrTail).toContain("boom")
    }
  })

  it("does not throw when the binary does not exist (translates ENOENT to failed)", async () => {
    const launcher = createShellLauncher()
    const result = await launcher.run({
      command: "/no/such/binary",
      args: [],
    })
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      // 127 is the conventional "command not found" exit code; we use it
      // for any pre-exec spawn failure since the actual exit never happened.
      expect(result.exitCode).toBe(127)
      expect(result.stderrTail).toBeDefined()
    }
  })

  it("applies env overrides — fake-game.sh respects KORRI_FAKE_GAME_EXIT", async () => {
    const launcher = createShellLauncher()
    const result = await launcher.run({
      command: FAKE_GAME,
      args: [],
      env: { KORRI_FAKE_GAME_EXIT: "42" },
    })
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(42)
    }
  })

  it("unsets inherited env values when the launch spec uses envUnset", async () => {
    const previous = process.env.KORRI_SHELL_LAUNCHER_UNSET_TEST
    process.env.KORRI_SHELL_LAUNCHER_UNSET_TEST = "present"
    try {
      const launcher = createShellLauncher()
      const unsetProbe = 'test -z "$' + '{KORRI_SHELL_LAUNCHER_UNSET_TEST+x}"'
      const result = await launcher.run({
        command: "/bin/sh",
        args: ["-c", unsetProbe],
        envUnset: ["KORRI_SHELL_LAUNCHER_UNSET_TEST"],
      })
      expect(result).toEqual({ status: "launched" })
    } finally {
      if (previous === undefined) {
        delete process.env.KORRI_SHELL_LAUNCHER_UNSET_TEST
      } else {
        process.env.KORRI_SHELL_LAUNCHER_UNSET_TEST = previous
      }
    }
  })

  it("integrates with fake-game.sh — argv echoed in stderr matches what the launcher passed", async () => {
    const launcher = createShellLauncher()
    const argv = [
      "/storage/roms/snes/Super Mario World.smc",
      "-Psnes",
      "--core=snes9x",
      "--emulator=retroarch",
    ]
    const result = await launcher.run({
      command: FAKE_GAME,
      args: argv,
      env: { KORRI_FAKE_GAME_EXIT: "5" },
    })
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(5)
      // fake-game.sh echoes "argv: <token>" per token to stderr.
      for (const token of argv) {
        expect(result.stderrTail).toContain(`argv: ${token}`)
      }
    }
  })

  it("preserves spaces and shell metacharacters in args without shell expansion", async () => {
    const launcher = createShellLauncher()
    // If a shell were involved, `;rm -rf /` would be interpreted. Since
    // Bun.spawn takes argv directly, the whole string is one argument.
    const evilArg = "filename with spaces; rm -rf / && echo pwned"
    const result = await launcher.run({
      command: FAKE_GAME,
      args: [evilArg],
    })
    expect(result.status).toBe("launched")
    // Even though we asked for { status: launched }, we want to confirm
    // the stderr (captured by fake-game.sh on stdout-of-stderr) records
    // the literal one-argument form. fake-game.sh writes argv to stderr,
    // but { status: launched } means we threw away stderrTail. Re-run
    // with a non-zero exit to capture argv:
    const failed = await launcher.run({
      command: FAKE_GAME,
      args: [evilArg],
      env: { KORRI_FAKE_GAME_EXIT: "1" },
    })
    if (failed.status === "failed") {
      expect(failed.stderrTail).toContain(`argv: ${evilArg}`)
    }
  })

  it("managed spawn preserves argv, env, cwd, and terminal stderr diagnostics", async () => {
    const launcher = createShellLauncher()
    const cwd = resolve(REPO_ROOT, "out", "tmp")
    mkdirSync(cwd, { recursive: true })
    const evilArg = "filename with spaces; rm -rf / && echo pwned"
    const spawn = launcher.spawn
    if (!spawn) throw new Error("shell launcher missing managed spawn")
    const managed = await spawn({
      command: "/bin/sh",
      args: [
        "-c",
        'printf \'cwd:%s\\n\' "$PWD" 1>&2; printf \'arg:%s\\n\' "$1" 1>&2; exit "$KORRI_FAKE_GAME_EXIT"',
        "sh",
        evilArg,
      ],
      env: { KORRI_FAKE_GAME_EXIT: "9" },
      cwd,
    })

    expect(managed.status).toBe("started")
    if (managed.status === "started") {
      expect(managed.session.processId).toBeGreaterThan(0)
      expect(await managed.session.exited).toEqual({ exitCode: 9 })
      const result = await managed.result
      expect(result.status).toBe("failed")
      if (result.status === "failed") {
        expect(result.exitCode).toBe(9)
        expect(result.stderrTail).toContain(`cwd:${cwd}`)
        expect(result.stderrTail).toContain(`arg:${evilArg}`)
      }
    }
  })

  it("managed spawn returns failed without a handle when the binary does not exist", async () => {
    const launcher = createShellLauncher()
    const spawn = launcher.spawn
    if (!spawn) throw new Error("shell launcher missing managed spawn")
    const managed = await spawn({
      command: "/no/such/binary",
      args: [],
    })

    expect(managed.status).toBe("failed")
    if (managed.status === "failed") {
      expect(managed.result.exitCode).toBe(127)
      expect(managed.result.stderrTail).toBeDefined()
    }
  })

  it("exposes no processGroupId when processGroup is disabled (default)", async () => {
    const launcher = createShellLauncher()
    const spawn = launcher.spawn
    if (!spawn) throw new Error("shell launcher missing managed spawn")
    const managed = await spawn({
      command: "/bin/sh",
      args: ["-c", "exit 0"],
    })
    expect(managed.status).toBe("started")
    if (managed.status === "started") {
      expect(managed.session.processGroupId).toBeUndefined()
      await managed.result
    }
  })

  it("wraps managed spawn with setsid and exposes processGroupId when processGroup is true", async () => {
    const launcher = createShellLauncher({ processGroup: true })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("shell launcher missing managed spawn")
    const managed = await spawn({
      command: "/bin/sh",
      args: ["-c", "exit 0"],
    })
    expect(managed.status).toBe("started")
    if (managed.status === "started") {
      expect(managed.session.processGroupId).toBe(managed.session.processId)
      const result = await managed.result
      expect(result).toEqual({ status: "launched" })
    }
  })

  it("managed spawn with processGroup still captures stderr tail on failure", async () => {
    const launcher = createShellLauncher({ processGroup: true })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("shell launcher missing managed spawn")
    const managed = await spawn({
      command: "/bin/sh",
      args: ["-c", "echo boom 1>&2; exit 7"],
    })
    if (managed.status === "failed") throw new Error("unexpected pre-exec fail")
    const result = await managed.result
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(7)
      expect(result.stderrTail).toContain("boom")
    }
  })
})
