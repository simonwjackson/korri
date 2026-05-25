// This file is intentionally not batched into a single fixture-level
// nix eval. Its two tests do fundamentally different work (one dry-builds
// the x86 live USB ISO derivation via `nix build --dry-run`, the other is
// a documentation smoke against `docs/deployment/korri-images.md`).
// Sharing one eval would conflate them for no time savings: the
// dry-build is bound by nix store/derivation work, not by overrides.
// See docs/plans/2026-05-24-006-refactor-nix-test-harness-plan.md U7.
import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const DOC_PATH = resolve(FLAKE_ROOT, "docs/deployment/korri-images.md")

setDefaultTimeout(90_000)

describe("Korri live USB smoke", () => {
  it("dry-builds the x86 live USB ISO derivations", () => {
    const child = spawnSync(
      "nix",
      [
        "--extra-experimental-features",
        "nix-command flakes",
        "build",
        ".#packages.x86_64-linux.korri-kiosk-live-iso",
        ".#packages.x86_64-linux.korri-kiosk-live-developer-iso",
        "--dry-run",
        "--no-link",
      ],
      {
        cwd: FLAKE_ROOT,
        encoding: "utf8",
        env: { ...process.env, NIX_PATH: "" },
      },
    )

    expect(child.status, child.stderr).toBe(0)
  })

  it("documents live USB flashing, persistence, and physical NUC acceptance", () => {
    const docs = readFileSync(DOC_PATH, "utf8")
    expect(docs).toContain("Product ISO")
    expect(docs).toContain("Developer ISO")
    expect(docs).toContain("korri-kiosk-live-iso")
    expect(docs).toContain("korri-kiosk-live-developer-iso")
    expect(docs).toContain("not an installer")
    expect(docs).toContain("allowlisted")
    expect(docs).toContain("broad Developer persistence")
    expect(docs).toContain("no-op")
    expect(docs).toContain("old broad-home")
    expect(docs).toContain("ephemeral")
    expect(docs).toContain("KORRI-PERSIST")
    expect(docs).toContain("internal disk")
    expect(docs).not.toContain(
      "routes Korri client state under `/persist/korri-live-usb/home`",
    )
    expect(docs).toContain("8th-gen Intel NUC")
    expect(docs).toContain("XInput-compatible wired USB controller")
    expect(docs).toContain("moonlight-embedded")
    expect(docs).toContain("korri-live-usb-config")
    expect(docs).toContain("korri-live-usb-developer-config")
    expect(docs).toContain("korri-live-usb-vm-smoke")
    expect(docs).toContain("korri-live-usb-qemu")
    expect(docs).toContain("korri-live-usb-qemu-persistence")
    expect(docs).toContain("korri-live-usb-developer-qemu")
    expect(docs).toContain("korri-live-usb-developer-qemu-persistence")
    expect(docs).toContain("does not replace physical NUC acceptance")
  })
})
