import { describe, expect, test } from "bun:test"
import {
  classifyOdinDesktopPreflight,
  parseOdinDesktopPreflightFacts,
} from "./odin-desktop-preflight"

const readyFacts = {
  sshReachable: true,
  architecture: "aarch64",
  projectExists: true,
  envExists: true,
  bunExists: true,
  nixStoreExists: true,
  nixStoreMounted: true,
  nixCommandExists: true,
  nixProfileExists: true,
  portableNixExists: false,
  korriDesktopAppPath: "/nix/store/hash-korri-desktop/bin/korri-desktop-odin",
  korriDesktopAppOrigin: "nix" as const,
  appStateRootWritable: true,
  swayActive: true,
  esswayActive: true,
  emulationStationRunning: true,
  storageAvailableKb: 8_000_000,
}

describe("Odin desktop preflight", () => {
  test("reports ready when the Odin has Layer 8 substrate and a Nix app candidate", () => {
    const report = classifyOdinDesktopPreflight(readyFacts)

    expect(report.ok).toBe(true)
    expect(report.status).toBe("ready")
    expect(report.messages).toContain(
      "Odin Layer 8 Electrobun preflight passed.",
    )
  })

  test("reports substrate-ready when the Korri app has not been installed yet", () => {
    const report = classifyOdinDesktopPreflight({
      ...readyFacts,
      korriDesktopAppPath: null,
      korriDesktopAppOrigin: "missing",
    })

    expect(report.ok).toBe(true)
    expect(report.status).toBe("warning")
    expect(report.messages).toContain(
      "Korri Electrobun app is not installed or not on PATH yet.",
    )
    expect(report.recommendations.join("\n")).toContain("renderer smoke")
  })

  test("blocks when SSH cannot reach the Odin", () => {
    const report = classifyOdinDesktopPreflight({
      ...readyFacts,
      sshReachable: false,
      architecture: null,
    })

    expect(report.ok).toBe(false)
    expect(report.status).toBe("blocked")
    expect(report.messages).toContain("Odin is not reachable over SSH.")
    expect(report.recommendations.join("\n")).toContain("ODIN_HOST")
  })

  test("blocks when real /nix is not mounted", () => {
    const report = classifyOdinDesktopPreflight({
      ...readyFacts,
      nixStoreExists: true,
      nixStoreMounted: false,
      portableNixExists: true,
    })

    expect(report.ok).toBe(false)
    expect(report.status).toBe("blocked")
    expect(report.messages).toContain(
      "Odin does not expose a real mounted /nix store.",
    )
    expect(report.recommendations.join("\n")).toContain(
      "Chromium renderer fallback has been removed",
    )
  })

  test("blocks when nix commands are absent", () => {
    const report = classifyOdinDesktopPreflight({
      ...readyFacts,
      nixCommandExists: false,
    })

    expect(report.ok).toBe(false)
    expect(report.messages).toContain(
      "The nix command is not available on the Odin.",
    )
  })

  test("blocks when the selected Korri app is not Nix-managed", () => {
    const report = classifyOdinDesktopPreflight({
      ...readyFacts,
      korriDesktopAppPath: "/usr/bin/korri-desktop-odin",
      korriDesktopAppOrigin: "non-nix",
    })

    expect(report.ok).toBe(false)
    expect(report.messages.join("\n")).toContain(
      "resolves outside the Nix store/profile",
    )
  })

  test("blocks when the Electrobun app state root is not writable", () => {
    const report = classifyOdinDesktopPreflight({
      ...readyFacts,
      appStateRootWritable: false,
    })

    expect(report.ok).toBe(false)
    expect(report.messages).toContain(
      "Electrobun app state root is not writable under /storage.",
    )
  })

  test("warns when daemon/profile conveniences are absent but launch substrate is ready", () => {
    const report = classifyOdinDesktopPreflight({
      ...readyFacts,
      nixProfileExists: false,
    })

    expect(report.ok).toBe(true)
    expect(report.status).toBe("warning")
    expect(report.messages).toContain("Odin /storage/.nix-profile is missing.")
  })

  test("parses shell-collected key value facts", () => {
    const facts = parseOdinDesktopPreflightFacts(
      [
        "ssh_reachable=yes",
        "architecture=aarch64",
        "project_exists=yes",
        "env_exists=yes",
        "bun_exists=yes",
        "nix_store_exists=yes",
        "nix_store_mounted=yes",
        "nix_command_exists=no",
        "nix_profile_exists=yes",
        "portable_nix_exists=no",
        "korri_desktop_app_path=/nix/store/hash/bin/korri-desktop-odin",
        "korri_desktop_app_origin=nix",
        "app_state_root_writable=yes",
        "sway_active=yes",
        "essway_active=no",
        "emulationstation_running=yes",
        "storage_available_kb=4096",
      ].join("\n"),
    )

    expect(facts).toEqual({
      sshReachable: true,
      architecture: "aarch64",
      projectExists: true,
      envExists: true,
      bunExists: true,
      nixStoreExists: true,
      nixStoreMounted: true,
      nixCommandExists: false,
      nixProfileExists: true,
      portableNixExists: false,
      korriDesktopAppPath: "/nix/store/hash/bin/korri-desktop-odin",
      korriDesktopAppOrigin: "nix",
      appStateRootWritable: true,
      swayActive: true,
      esswayActive: false,
      emulationStationRunning: true,
      storageAvailableKb: 4096,
    })
  })
})
