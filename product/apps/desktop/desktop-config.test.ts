import { describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type DesktopConfigEnv,
  desktopConfigPath,
  loadDesktopConfig,
  saveDesktopConfig,
} from "./desktop-config"

function makeEnv(): DesktopConfigEnv {
  const root = mkdtempSync(join(tmpdir(), "korri-desktop-config-"))
  return { XDG_CONFIG_HOME: root, HOME: root } as DesktopConfigEnv
}

describe("desktop-config", () => {
  it("resolves the config path to <XDG_CONFIG_HOME>/korri/desktop.yaml", () => {
    const env = makeEnv()
    expect(desktopConfigPath(env)).toBe(
      join(env.XDG_CONFIG_HOME ?? "", "korri", "desktop.yaml"),
    )
  })

  it("returns an empty config when the file is missing", async () => {
    const env = makeEnv()
    const config = await loadDesktopConfig(env)
    expect(config).toEqual({})
  })

  it("returns an empty config when the file is empty", async () => {
    const env = makeEnv()
    const path = desktopConfigPath(env)
    await saveDesktopConfig(env, {})
    writeFileSync(path, "")
    const config = await loadDesktopConfig(env)
    expect(config).toEqual({})
  })

  it("preserves unknown keys across save (forward compatibility)", async () => {
    const env = makeEnv()
    const path = desktopConfigPath(env)
    // Ensure parent dir exists — saveDesktopConfig normally does this,
    // but the test seeds the YAML directly first.
    await saveDesktopConfig(env, {})
    writeFileSync(path, "federationPreferences:\n  primary: aka\n")
    // Save a different (also unknown) field; both keys must persist
    // through the round-trip.
    await saveDesktopConfig(env, {
      experimentalFlag: true,
    } as Record<string, unknown>)
    const after = readFileSync(path, "utf8")
    expect(after).toContain("federationPreferences")
    expect(after).toContain("experimentalFlag")
  })

  it("returns an empty config when YAML is corrupt and logs no throw", async () => {
    const env = makeEnv()
    const path = desktopConfigPath(env)
    await saveDesktopConfig(env, {})
    writeFileSync(path, "::: not valid yaml :::\n")
    const config = await loadDesktopConfig(env)
    expect(config).toEqual({})
  })

  it("creates the parent directory on save if missing", async () => {
    const env = makeEnv()
    await saveDesktopConfig(env, { someField: "value" } as Record<
      string,
      unknown
    >)
    const config = await loadDesktopConfig(env)
    expect(config.someField).toBe("value")
  })

  it("is robust to concurrent saves via atomic rename", async () => {
    const env = makeEnv()
    await Promise.all([
      saveDesktopConfig(env, { someField: "a" } as Record<string, unknown>),
      saveDesktopConfig(env, { someField: "b" } as Record<string, unknown>),
      saveDesktopConfig(env, { someField: "c" } as Record<string, unknown>),
    ])
    const config = await loadDesktopConfig(env)
    // The final file must parse and contain one of the candidates.
    expect(["a", "b", "c"]).toContain(config.someField as string)
  })

  it("rejects non-object YAML by returning empty config", async () => {
    const env = makeEnv()
    const path = desktopConfigPath(env)
    await saveDesktopConfig(env, {})
    writeFileSync(path, "42\n")
    const config = await loadDesktopConfig(env)
    expect(config).toEqual({})
  })

  it("silently drops legacy lastConnectedServer entries (federation R14)", async () => {
    const env = makeEnv()
    const path = desktopConfigPath(env)
    await saveDesktopConfig(env, {})
    writeFileSync(
      path,
      "lastConnectedServer:\n  hostId: aka\n  controlUrl: http://aka:3010\nfederationPreferences:\n  primary: aka\n",
    )
    const config = await loadDesktopConfig(env)
    // Legacy field is silently dropped — no migration warning per
    // zero-backwards-compat.
    expect(config.lastConnectedServer).toBeUndefined()
    // Other unknown fields still pass through.
    expect(config.federationPreferences).toBeDefined()
  })
})
