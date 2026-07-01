import { describe, expect, it } from "bun:test"
import {
  korriDataPath,
  korriStatePath,
  requireXdgDataHome,
  xdgCacheHome,
  xdgConfigHome,
  xdgDataHome,
  xdgRuntimeDir,
  xdgStateHome,
} from "./xdg-paths"

describe("XDG path helpers", () => {
  it("honors explicit XDG roots before HOME fallbacks", () => {
    const env = {
      HOME: "/home/alice",
      XDG_DATA_HOME: "/data",
      XDG_STATE_HOME: "/state",
      XDG_CONFIG_HOME: "/config",
      XDG_CACHE_HOME: "/cache",
      XDG_RUNTIME_DIR: "/run/user/1000",
    }

    expect(xdgDataHome(env)).toBe("/data")
    expect(xdgStateHome(env)).toBe("/state")
    expect(xdgConfigHome(env)).toBe("/config")
    expect(xdgCacheHome(env)).toBe("/cache")
    expect(xdgRuntimeDir(env)).toBe("/run/user/1000")
  })

  it("uses XDG HOME-based defaults without hardcoded device paths", () => {
    const env = { HOME: "/home/alice" }

    expect(xdgDataHome(env)).toBe("/home/alice/.local/share")
    expect(xdgStateHome(env)).toBe("/home/alice/.local/state")
    expect(xdgConfigHome(env)).toBe("/home/alice/.config")
    expect(xdgCacheHome(env)).toBe("/home/alice/.cache")
    expect(korriDataPath(env, "library")).toBe(
      "/home/alice/.local/share/korri/library",
    )
    expect(korriStatePath(env, "chromium", "status.json")).toBe(
      "/home/alice/.local/state/korri/chromium/status.json",
    )
  })

  it("fails clearly when a persistent root cannot be resolved", () => {
    expect(() => requireXdgDataHome({})).toThrow("XDG_DATA_HOME or HOME")
  })
})
