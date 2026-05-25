import { describe, expect, it } from "bun:test"
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { type CommandRunner, launchMoonlight } from "./moonlight-launcher"

const PROC_FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")

describe("moonlight launcher", () => {
  it("wraps installed moonlight in default Gamescope with embedded-client args", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "gamescope" })
    expect(calls).toEqual([
      "gamescope -f -b -- moonlight stream -app Korri Stream aka.local",
    ])
  })

  it("uses a configured Gamescope wrapper command", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      gamescope: {
        enabled: true,
        command: "/run/current-system/sw/bin/korri-gamescope-no-portal",
      },
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result).toEqual({
      status: "started",
      command: "/run/current-system/sw/bin/korri-gamescope-no-portal",
    })
    expect(calls).toEqual([
      "/run/current-system/sw/bin/korri-gamescope-no-portal -f -b -- moonlight stream -app Korri Stream aka.local",
    ])
  })

  it("launches moonlight unwrapped when Gamescope is explicitly disabled", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      gamescope: { enabled: false },
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "moonlight" })
    expect(calls).toEqual(["moonlight stream -app Korri Stream aka.local"])
  })

  it("falls back to nix moonlight-embedded when installed moonlight is missing", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "aka.local",
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return calls.length === 1
          ? { status: "failed", message: "ENOENT" }
          : { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "gamescope" })
    expect(calls).toEqual([
      "gamescope -f -b -- moonlight stream -app Korri Stream aka.local",
      "gamescope -f -b -- nix run nixpkgs#moonlight-embedded -- stream -app Korri Stream aka.local",
    ])
  })

  it("ignores legacy qt client env and keeps embedded-client args", async () => {
    const previousClient = Bun.env.KORRI_MOONLIGHT_CLIENT
    const calls: string[] = []
    try {
      Bun.env.KORRI_MOONLIGHT_CLIENT = "qt"
      const result = await launchMoonlight({
        host: "aka.local",
        runner: runner((command, args) => {
          calls.push([command, ...args].join(" "))
          return { status: "started" }
        }),
      })

      expect(result).toEqual({ status: "started", command: "gamescope" })
      expect(calls).toEqual([
        "gamescope -f -b -- moonlight stream -app Korri Stream aka.local",
      ])
    } finally {
      if (previousClient === undefined) delete Bun.env.KORRI_MOONLIGHT_CLIENT
      else Bun.env.KORRI_MOONLIGHT_CLIENT = previousClient
    }
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
        "gamescope -f -b -- /nix/store/moonlight-embedded/bin/moonlight stream -app Korri Stream 192.168.1.117",
      ])
    } finally {
      if (previous === undefined) delete Bun.env.KORRI_MOONLIGHT_COMMAND
      else Bun.env.KORRI_MOONLIGHT_COMMAND = previous
      if (previousClient === undefined) delete Bun.env.KORRI_MOONLIGHT_CLIENT
      else Bun.env.KORRI_MOONLIGHT_CLIENT = previousClient
    }
  })

  it("preflights the InputPlumber virtual controller while leaving Moonlight input discovery enabled", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      mappingFile: "/nix/store/moonlight/share/moonlight/gamecontrollerdb.txt",
      requireInputPlumberInput: true,
      readProcDevices: async () =>
        readFileSync(
          join(PROC_FIXTURES_DIR, "bus-input-devices-inputplumber-virtual.txt"),
          "utf8",
        ),
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "gamescope" })
    expect(calls).toEqual([
      "gamescope -f -b -- moonlight stream -mapping /nix/store/moonlight/share/moonlight/gamecontrollerdb.txt -app Korri Stream 192.168.1.117",
    ])
  })

  it("fails closed without spawning moonlight when appliance input is missing", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      requireInputPlumberInput: true,
      readProcDevices: async () =>
        readFileSync(
          join(
            PROC_FIXTURES_DIR,
            "bus-input-devices-inputplumber-raw-only.txt",
          ),
          "utf8",
        ),
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.message).toContain("InputPlumber virtual gamepad")
    }
    expect(calls).toEqual([])
  })

  it("ignores explicit input paths so Moonlight can discover touch and gamepad together", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      inputDevice: "/dev/input/event3",
      requireInputPlumberInput: true,
      readProcDevices: async () =>
        readFileSync(
          join(PROC_FIXTURES_DIR, "bus-input-devices-inputplumber-virtual.txt"),
          "utf8",
        ),
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "gamescope" })
    expect(calls).toEqual([
      "gamescope -f -b -- moonlight stream -app Korri Stream 192.168.1.117",
    ])
  })

  it("does not reject SDL platform selection for stale explicit input configuration", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      inputDevice: "/dev/input/event10",
      platform: "sdl",
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "gamescope" })
    expect(calls).toEqual([
      "gamescope -f -b -- moonlight stream -platform sdl -app Korri Stream 192.168.1.117",
    ])
  })

  it("exposes Wayland when the Moonlight platform is Wayland", async () => {
    const calls: string[] = []
    const result = await launchMoonlight({
      host: "192.168.1.117",
      platform: "wayland",
      runner: runner((command, args) => {
        calls.push([command, ...args].join(" "))
        return { status: "started" }
      }),
    })

    expect(result).toEqual({ status: "started", command: "gamescope" })
    expect(calls).toEqual([
      "gamescope -f -b --expose-wayland -- moonlight stream -platform wayland -app Korri Stream 192.168.1.117",
    ])
  })

  it("passes KORRI_MOONLIGHT_MAPPING_FILE to moonlight-embedded", async () => {
    const previous = Bun.env.KORRI_MOONLIGHT_MAPPING_FILE
    const calls: string[] = []
    try {
      Bun.env.KORRI_MOONLIGHT_MAPPING_FILE =
        "/nix/store/moonlight-embedded/share/moonlight/gamecontrollerdb.txt"
      const result = await launchMoonlight({
        host: "192.168.1.117",
        runner: runner((command, args) => {
          calls.push([command, ...args].join(" "))
          return { status: "started" }
        }),
      })

      expect(result).toEqual({ status: "started", command: "gamescope" })
      expect(calls).toEqual([
        "gamescope -f -b -- moonlight stream -mapping /nix/store/moonlight-embedded/share/moonlight/gamecontrollerdb.txt -app Korri Stream 192.168.1.117",
      ])
    } finally {
      if (previous === undefined) delete Bun.env.KORRI_MOONLIGHT_MAPPING_FILE
      else Bun.env.KORRI_MOONLIGHT_MAPPING_FILE = previous
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
      "gamescope -f -b -- /nix/store/moonlight-embedded/bin/moonlight stream -app Korri Stream 192.168.1.117",
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
        gamescope: { enabled: false },
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
      expect(result.message).toContain("gamescope missing")
      expect(result.message).toContain("nix fallback")
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
