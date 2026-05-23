import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const DOC_PATH = resolve(FLAKE_ROOT, "docs/deployment/korri-images.md")

setDefaultTimeout(90_000)

describe("Korri live USB smoke", () => {
  it("dry-builds the x86 live USB ISO derivation", () => {
    const child = spawnSync(
      "nix",
      [
        "--extra-experimental-features",
        "nix-command flakes",
        "build",
        ".#packages.x86_64-linux.korri-kiosk-live-iso",
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
    expect(docs).toContain("korri-kiosk-live-iso")
    expect(docs).toContain("not an installer")
    expect(docs).toContain("KORRI-PERSIST")
    expect(docs).toContain("internal disk")
    expect(docs).toContain("8th-gen Intel NUC")
    expect(docs).toContain("XInput-compatible wired USB controller")
    expect(docs).toContain("moonlight-embedded")
    expect(docs).toContain("korri-live-usb-config")
    expect(docs).toContain("korri-live-usb-vm-smoke")
    expect(docs).toContain("korri-live-usb-qemu")
    expect(docs).toContain("korri-live-usb-qemu-persistence")
    expect(docs).toContain("does not replace physical NUC acceptance")
  })
})
