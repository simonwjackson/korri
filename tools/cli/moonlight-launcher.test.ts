import { describe, expect, it } from "bun:test"
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

  it("uses an appliance command without falling back to nix", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      command: "/nix/store/moonlight-embedded/bin/moonlight",
      allowNixFallback: false,
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "failed", message: "ENOENT" }
      }),
    })

    expect(result.status).toBe("failed")
    expect(calls).toEqual([
      "/nix/store/moonlight-embedded/bin/moonlight stream 192.168.1.117 Korri Stream",
    ])
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
