import { describe, expect, it } from "bun:test"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

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

  it("routes Remap bridge termination through the named transient user unit", async () => {
    const fixture = createFakeSystemdFixture()
    const launcher = createShellLauncher({
      processGroup: true,
      remapBridgeCommand: fixture.remapBridgeCommand,
      remapUnitNameFactory: () => "korri-remap-test.service",
      systemdRunCommand: fixture.systemdRunCommand,
      systemctlCommand: fixture.systemctlCommand,
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("shell launcher missing managed spawn")
    const managed = await spawn({
      command: fixture.remapBridgeCommand,
      args: ["--", "/bin/true"],
      env: { KORRI_TEST_UNIT_DIR: fixture.unitDir },
    })

    expect(managed.status).toBe("started")
    if (managed.status === "started") {
      expect(managed.session.processGroupId).toBeUndefined()
      managed.session.terminate()
      const result = await managed.result
      expect(result.status).toBe("failed")
      if (result.status === "failed") expect(result.exitCode).toBe(143)
      expect(readFileSync(fixture.runLog, "utf8")).toContain(
        "--unit=korri-remap-test.service",
      )
      expect(readFileSync(fixture.runLog, "utf8")).toContain(
        "--property=KillMode=control-group",
      )
      expect(readFileSync(fixture.ctlLog, "utf8")).toContain(
        "--user stop korri-remap-test.service",
      )
    }
  })

  it("force terminates Remap bridge units with SIGKILL before stop", async () => {
    const fixture = createFakeSystemdFixture()
    const launcher = createShellLauncher({
      processGroup: true,
      remapBridgeCommand: fixture.remapBridgeCommand,
      remapUnitNameFactory: () => "korri-remap-force-test.service",
      systemdRunCommand: fixture.systemdRunCommand,
      systemctlCommand: fixture.systemctlCommand,
    })
    const spawn = launcher.spawn
    if (!spawn) throw new Error("shell launcher missing managed spawn")
    const managed = await spawn({
      command: fixture.remapBridgeCommand,
      args: ["--", "/bin/true"],
      env: { KORRI_TEST_UNIT_DIR: fixture.unitDir },
    })

    expect(managed.status).toBe("started")
    if (managed.status === "started") {
      managed.session.terminateNow()
      const result = await managed.result
      expect(result.status).toBe("failed")
      if (result.status === "failed") expect(result.exitCode).toBe(137)
      const ctlLog = readFileSync(fixture.ctlLog, "utf8")
      expect(ctlLog).toContain(
        "--user kill --kill-whom=all --signal=SIGKILL korri-remap-force-test.service",
      )
      expect(ctlLog).toContain("--user stop korri-remap-force-test.service")
    }
  })
})

function createFakeSystemdFixture(): {
  readonly unitDir: string
  readonly runLog: string
  readonly ctlLog: string
  readonly systemdRunCommand: string
  readonly systemctlCommand: string
  readonly remapBridgeCommand: string
} {
  const root = mkdtempSync(join(tmpdir(), "korri-shell-launcher-"))
  const unitDir = join(root, "units")
  mkdirSync(unitDir)
  const runLog = join(root, "systemd-run.log")
  const ctlLog = join(root, "systemctl.log")
  const systemdRunCommand = join(root, "systemd-run")
  const systemctlCommand = join(root, "systemctl")
  const remapBridgeCommand = join(root, "korri-remap-bridge")

  writeFileSync(
    systemdRunCommand,
    `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$KORRI_TEST_UNIT_DIR/../systemd-run.log"
unit=""
for arg in "$@"; do
  case "$arg" in
    --unit=*) unit="\${arg#--unit=}" ;;
  esac
done
if [ -z "$unit" ]; then
  echo missing unit >&2
  exit 64
fi
while [ ! -e "$KORRI_TEST_UNIT_DIR/$unit.stop" ] && [ ! -e "$KORRI_TEST_UNIT_DIR/$unit.kill" ]; do
  sleep 0.05
done
if [ -e "$KORRI_TEST_UNIT_DIR/$unit.kill" ]; then
  exit 137
fi
exit 143
`,
  )
  writeFileSync(
    systemctlCommand,
    `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$KORRI_TEST_UNIT_DIR/../systemctl.log"
unit=""
for arg in "$@"; do
  unit="$arg"
done
case "$*" in
  *" kill "*) touch "$KORRI_TEST_UNIT_DIR/$unit.kill" ;;
  *" stop "*) touch "$KORRI_TEST_UNIT_DIR/$unit.stop" ;;
esac
exit 0
`,
  )
  writeFileSync(remapBridgeCommand, "#!/bin/sh\nexit 0\n")
  chmodSync(systemdRunCommand, 0o755)
  chmodSync(systemctlCommand, 0o755)
  chmodSync(remapBridgeCommand, 0o755)

  return {
    unitDir,
    runLog,
    ctlLog,
    systemdRunCommand,
    systemctlCommand,
    remapBridgeCommand,
  }
}
