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

  it("round-trips a lastConnectedServer record", async () => {
    const env = makeEnv()
    await saveDesktopConfig(env, {
      lastConnectedServer: {
        hostId: "aka",
        controlUrl: "http://192.168.1.50:3010",
      },
    })
    const config = await loadDesktopConfig(env)
    expect(config.lastConnectedServer).toEqual({
      hostId: "aka",
      controlUrl: "http://192.168.1.50:3010",
    })
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
    await saveDesktopConfig(env, {
      lastConnectedServer: {
        hostId: "aka",
        controlUrl: "http://aka.local:3010",
      },
    })
    const path = desktopConfigPath(env)
    const raw = readFileSync(path, "utf8")
    writeFileSync(path, `${raw}\nfederationPreferences:\n  primary: aka\n`)

    await saveDesktopConfig(env, {
      lastConnectedServer: {
        hostId: "kara",
        controlUrl: "http://kara.local:3010",
      },
    })

    const after = readFileSync(path, "utf8")
    expect(after).toContain("federationPreferences")
    expect(after).toContain("kara")
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
    await saveDesktopConfig(env, {
      lastConnectedServer: { hostId: "aka", controlUrl: "http://aka:3010" },
    })
    const config = await loadDesktopConfig(env)
    expect(config.lastConnectedServer?.hostId).toBe("aka")
  })

  it("is robust to concurrent saves via atomic rename", async () => {
    const env = makeEnv()
    await Promise.all([
      saveDesktopConfig(env, {
        lastConnectedServer: { hostId: "a", controlUrl: "http://a:3010" },
      }),
      saveDesktopConfig(env, {
        lastConnectedServer: { hostId: "b", controlUrl: "http://b:3010" },
      }),
      saveDesktopConfig(env, {
        lastConnectedServer: { hostId: "c", controlUrl: "http://c:3010" },
      }),
    ])
    const config = await loadDesktopConfig(env)
    // The final file must parse and contain one of the candidates.
    expect(config.lastConnectedServer?.hostId).toMatch(/^[abc]$/)
  })

  it("rejects non-object YAML by returning empty config", async () => {
    const env = makeEnv()
    const path = desktopConfigPath(env)
    await saveDesktopConfig(env, {})
    writeFileSync(path, "42\n")
    const config = await loadDesktopConfig(env)
    expect(config).toEqual({})
  })

  it("ignores a malformed lastConnectedServer entry", async () => {
    const env = makeEnv()
    const path = desktopConfigPath(env)
    await saveDesktopConfig(env, {})
    writeFileSync(
      path,
      "lastConnectedServer:\n  hostId: 42\n  controlUrl: true\n",
    )
    const config = await loadDesktopConfig(env)
    expect(config.lastConnectedServer).toBeUndefined()
  })
})
