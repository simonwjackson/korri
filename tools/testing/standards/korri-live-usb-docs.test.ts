import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..")
const DOC_PATH = resolve(REPO_ROOT, "docs/deployment/korri-images.md")

describe("Korri live USB documentation", () => {
  it("documents flashing, persistence, and physical NUC acceptance", () => {
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
