import { describe, expect, it } from "bun:test"
import {
  buildDeviceFlakeExecutionPlan,
  checkDirtyFlakeRun,
  DeviceFlakeCommandError,
  isCommittedStateFlakeRef,
  parseShellWords,
  runDeviceFlakeCommandCli,
} from "./flake-command"

describe("buildDeviceFlakeExecutionPlan", () => {
  it("builds a local nix run command by default", () => {
    const plan = buildDeviceFlakeExecutionPlan()

    expect(plan).toMatchObject({
      mode: "local",
      flakeRef: ".",
      app: "korri-desktop-device",
      command: "nix",
      args: ["run", ".#korri-desktop-device"],
      displayCommand: "nix run .#korri-desktop-device",
    })
  })

  it("runs an inferred git ssh flake ref on the destination host", () => {
    const plan = buildDeviceFlakeExecutionPlan(
      { DEVICE_HOST: "root@example-device" },
      {
        repoRoot: () => "/home/me/code/korri",
        sourceHost: () => "source.example",
      },
    )

    expect(plan).toMatchObject({
      mode: "ssh",
      flakeRef: "git+ssh://source.example/home/me/code/korri",
      app: "korri-desktop-device",
      command: "ssh",
      args: [
        "root@example-device",
        "nix run git+ssh://source.example/home/me/code/korri#korri-desktop-device",
      ],
      remoteCommand:
        "nix run git+ssh://source.example/home/me/code/korri#korri-desktop-device",
    })
  })

  it("uses KORRI_SOURCE_HOST for inferred remote flake refs", () => {
    const plan = buildDeviceFlakeExecutionPlan(
      {
        DEVICE_HOST: "root@example-device",
        KORRI_SOURCE_HOST: "override.example",
      },
      {
        repoRoot: () => "/repo/korri",
        sourceHost: () => "ignored.example",
      },
    )

    expect(plan.flakeRef).toBe("git+ssh://override.example/repo/korri")
  })

  it("uses explicit flake refs instead of inference", () => {
    const plan = buildDeviceFlakeExecutionPlan({
      DEVICE_HOST: "root@example-device",
      KORRI_FLAKE_REF: "github:example/korri",
      KORRI_APP: "custom-app",
    })

    expect(plan).toMatchObject({
      mode: "ssh",
      flakeRef: "github:example/korri",
      app: "custom-app",
      args: ["root@example-device", "nix run github:example/korri#custom-app"],
    })
  })

  it("omits builder flags unless raw Nix builder env is present", () => {
    expect(buildDeviceFlakeExecutionPlan().args).toEqual([
      "run",
      ".#korri-desktop-device",
    ])

    expect(
      buildDeviceFlakeExecutionPlan({
        NIX_BUILDERS: "ssh://builder.example aarch64-linux - 8 1",
        NIX_MAX_JOBS: "0",
      }).args,
    ).toEqual([
      "run",
      "--builders",
      "ssh://builder.example aarch64-linux - 8 1",
      "--max-jobs",
      "0",
      ".#korri-desktop-device",
    ])
  })

  it("treats empty env values as absent", () => {
    const plan = buildDeviceFlakeExecutionPlan({
      DEVICE_HOST: " ",
      KORRI_FLAKE_REF: " ",
      KORRI_APP: " ",
      NIX_BUILDERS: " ",
      NIX_MAX_JOBS: " ",
    })

    expect(plan).toMatchObject({
      mode: "local",
      flakeRef: ".",
      app: "korri-desktop-device",
      args: ["run", ".#korri-desktop-device"],
    })
  })

  it("parses SSH options without folding them into the destination host", () => {
    const plan = buildDeviceFlakeExecutionPlan({
      DEVICE_HOST: "root@example-device",
      DEVICE_SSH_OPTS: "-p 2222 -o 'UserKnownHostsFile=/tmp/known hosts'",
      KORRI_FLAKE_REF: "git+ssh://source.example/repo/korri",
    })

    expect(plan.args).toEqual([
      "-p",
      "2222",
      "-o",
      "UserKnownHostsFile=/tmp/known hosts",
      "root@example-device",
      "nix run git+ssh://source.example/repo/korri#korri-desktop-device",
    ])
  })

  it("fails clearly when remote inference lacks a repo root", () => {
    expect(() =>
      buildDeviceFlakeExecutionPlan(
        { DEVICE_HOST: "root@example-device" },
        { sourceHost: () => "source.example" },
      ),
    ).toThrow("repository root")
  })

  it("fails clearly when remote inference lacks a source host", () => {
    expect(() =>
      buildDeviceFlakeExecutionPlan(
        { DEVICE_HOST: "root@example-device" },
        { repoRoot: () => "/repo/korri" },
      ),
    ).toThrow("source host")
  })

  it("rejects whitespace in DEVICE_HOST", () => {
    expect(() =>
      buildDeviceFlakeExecutionPlan({
        DEVICE_HOST: "root@example-device -p 2222",
        KORRI_FLAKE_REF: "git+ssh://source.example/repo/korri",
      }),
    ).toThrow("DEVICE_HOST")
  })

  it("rejects unclosed SSH option quotes", () => {
    expect(() =>
      buildDeviceFlakeExecutionPlan({
        DEVICE_HOST: "root@example-device",
        DEVICE_SSH_OPTS: "-o 'bad",
        KORRI_FLAKE_REF: "git+ssh://source.example/repo/korri",
      }),
    ).toThrow("unclosed quote")
  })

  it("rejects whitespace in app and flake selectors", () => {
    expect(() =>
      buildDeviceFlakeExecutionPlan({ KORRI_APP: "bad app" }),
    ).toThrow("KORRI_APP")

    expect(() =>
      buildDeviceFlakeExecutionPlan({ KORRI_FLAKE_REF: "bad ref" }),
    ).toThrow("KORRI_FLAKE_REF")
  })
})

describe("checkDirtyFlakeRun", () => {
  it("allows clean git flake refs without prompting", async () => {
    await expect(
      checkDirtyFlakeRun({
        flakeRef: "git+ssh://source.example/repo/korri",
        isDirty: false,
        isInteractive: false,
      }),
    ).resolves.toEqual({ allowed: true, reason: "clean" })
  })

  it("allows dirty local path refs without prompting", async () => {
    await expect(
      checkDirtyFlakeRun({
        flakeRef: ".",
        isDirty: true,
        isInteractive: false,
      }),
    ).resolves.toEqual({ allowed: true, reason: "not-git-backed" })
  })

  it("fails closed for dirty git flake refs in non-interactive mode", async () => {
    await expect(
      checkDirtyFlakeRun({
        flakeRef: "github:example/korri",
        isDirty: true,
        isInteractive: false,
      }),
    ).rejects.toThrow("Refusing non-interactive run")
  })

  it("allows dirty git flake refs with the explicit override", async () => {
    await expect(
      checkDirtyFlakeRun({
        flakeRef: "git+ssh://source.example/repo/korri",
        env: { KORRI_ALLOW_DIRTY_FLAKE_RUN: "1" },
        isDirty: true,
        isInteractive: false,
      }),
    ).resolves.toEqual({ allowed: true, reason: "override" })
  })

  it("allows dirty git flake refs after interactive confirmation", async () => {
    await expect(
      checkDirtyFlakeRun({
        flakeRef: "git+ssh://source.example/repo/korri",
        isDirty: true,
        isInteractive: true,
        confirm: async () => true,
      }),
    ).resolves.toEqual({ allowed: true, reason: "confirmed" })
  })

  it("aborts dirty git flake refs when confirmation is declined", async () => {
    await expect(
      checkDirtyFlakeRun({
        flakeRef: "git+ssh://source.example/repo/korri",
        isDirty: true,
        isInteractive: true,
        confirm: async () => false,
      }),
    ).rejects.toThrow("Aborted")
  })
})

describe("parseShellWords", () => {
  it("parses quoted and escaped words", () => {
    expect(parseShellWords("-p 2222 -o UserKnownHostsFile=/tmp/a\\ b")).toEqual(
      ["-p", "2222", "-o", "UserKnownHostsFile=/tmp/a b"],
    )
  })

  it("preserves backslashes inside single quotes", () => {
    expect(parseShellWords("-o 'IdentityFile=C:\\keys\\device'")).toEqual([
      "-o",
      "IdentityFile=C:\\keys\\device",
    ])
  })
})

describe("runDeviceFlakeCommandCli", () => {
  it("prints the command without executing it", async () => {
    const lines: string[] = []
    let executed = false

    const exitCode = await runDeviceFlakeCommandCli(["--print"], {
      env: {},
      repoRoot: () => "/repo/korri",
      isDirty: () => false,
      output: line => lines.push(line),
      execute: async () => {
        executed = true
        return 0
      },
    })

    expect(exitCode).toBe(0)
    expect(executed).toBe(false)
    expect(lines).toContain("mode=local")
    expect(lines).toContain("command=nix run .#korri-desktop-device")
  })

  it("maps usage requests to exit code 0 and bad args to exit code 2", async () => {
    const helpLines: string[] = []
    const helpExit = await runDeviceFlakeCommandCli(["--help"], {
      output: line => helpLines.push(line),
    })
    expect(helpExit).toBe(0)
    expect(helpLines[0]).toContain("--dry-run")

    const errors: string[] = []
    const badExit = await runDeviceFlakeCommandCli(["--unknown"], {
      error: line => errors.push(line),
    })
    expect(badExit).toBe(2)
    expect(errors[0]).toContain("Usage")
  })

  it("does not invent dirty state when no repository root exists", async () => {
    const lines: string[] = []

    const exitCode = await runDeviceFlakeCommandCli(["--print"], {
      env: { KORRI_FLAKE_REF: "github:example/korri" },
      repoRoot: () => undefined,
      output: line => lines.push(line),
    })

    expect(exitCode).toBe(0)
    expect(lines).toContain("flake=github:example/korri")
  })
})

describe("isCommittedStateFlakeRef", () => {
  it("matches Git-backed refs only", () => {
    expect(isCommittedStateFlakeRef("git+ssh://source/repo")).toBe(true)
    expect(isCommittedStateFlakeRef("github:example/repo")).toBe(true)
    expect(isCommittedStateFlakeRef(".")).toBe(false)
    expect(isCommittedStateFlakeRef("path:/repo/korri")).toBe(false)
  })
})

it("exports typed errors for callers", () => {
  const error = new DeviceFlakeCommandError("Example", "example")
  expect(error.code).toBe("Example")
})
