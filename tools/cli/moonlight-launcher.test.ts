import { describe, expect, it } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { type CommandRunner, launchMoonlight } from "./moonlight-launcher"

describe("moonlight launcher", () => {
  it("uses installed moonlight first", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "moonlight" })
    expect(calls).toEqual(["moonlight stream aka.local Korri Stream"])
  })

  it("falls back to nix moonlight-qt when installed moonlight is missing", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return command === "moonlight"
          ? { status: "failed", message: "ENOENT" }
          : { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "nix" })
    expect(calls).toEqual([
      "moonlight stream aka.local Korri Stream",
      "nix run nixpkgs#moonlight-qt -- stream aka.local Korri Stream",
    ])
  })

  it("uses KORRI_MOONLIGHT_COMMAND as an appliance no-fallback embedded command", async () => {
    const previous = Bun.env.KORRI_MOONLIGHT_COMMAND
    const previousClient = Bun.env.KORRI_MOONLIGHT_CLIENT
    const calls: string[] = []
    try {
      Bun.env.KORRI_MOONLIGHT_COMMAND =
        "/nix/store/moonlight-embedded/bin/moonlight"
      Bun.env.KORRI_MOONLIGHT_CLIENT = "embedded"
      const result = await launchMoonlight({
        host: "192.168.1.117",
        runner: runner((command, args) => {
          calls.push([command, ...args].join(" "))
          return { status: "failed", message: "ENOENT" }
        }),
      })

      expect(result.status).toBe("failed")
      expect(calls).toEqual([
        "/nix/store/moonlight-embedded/bin/moonlight stream -app Korri Stream 192.168.1.117",
      ])
    } finally {
      if (previous === undefined) delete Bun.env.KORRI_MOONLIGHT_COMMAND
      else Bun.env.KORRI_MOONLIGHT_COMMAND = previous
      if (previousClient === undefined) delete Bun.env.KORRI_MOONLIGHT_CLIENT
      else Bun.env.KORRI_MOONLIGHT_CLIENT = previousClient
    }
  })

  it("uses explicit embedded client args without falling back to nix", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      command: "/nix/store/moonlight-embedded/bin/moonlight",
      client: "embedded",
      allowNixFallback: false,
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "failed", message: "ENOENT" }
      }),
    })

    expect(result.status).toBe("failed")
    expect(calls).toEqual([
      "/nix/store/moonlight-embedded/bin/moonlight stream -app Korri Stream 192.168.1.117",
    ])
  })

  it("reports an early non-zero Moonlight exit during the startup observation window", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "korri-moonlight-test-"))
    const command = resolve(dir, "moonlight-fails")
    writeFileSync(command, "#!/usr/bin/env bash\nexit 42\n")
    chmodSync(command, 0o755)
    try {
      const result = await launchMoonlight({
        command,
        allowNixFallback: false,
        startupObserveMs: 250,
      })
      expect(result.status).toBe("failed")
      if (result.status === "failed") {
        expect(result.message).toContain("exited early")
        expect(result.message).toContain("42")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("reports both failures without throwing", async () => {
    const result = await launchMoonlight({
      runner: runner(command => ({
        status: "failed",
        message: `${command} missing`,
      })),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.message).toContain("moonlight missing")
      expect(result.message).toContain("nix missing")
    }
  })
})

function runner(
  fn: (
    command: string,
    args: readonly string[],
  ) =>
    | { readonly status: "started" }
    | { readonly status: "failed"; readonly message: string },
): CommandRunner {
  return { run: async (command, args) => fn(command, args) }
}
