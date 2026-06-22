import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildYfsLaunchUrl,
  parseYfsLaunchCli,
  terminateBrowserForFailedLaunch,
  yfsShimPaths,
} from "./yfs-launch"

const yfsLaunchSource = await Bun.file(
  "product/plugins/yoshis-fabrication-station/src/launcher/yfs-launch.ts",
).text()

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.map(root => rm(root, { recursive: true, force: true })),
  )
  tempRoots.length = 0
})

async function tempRoot(name: string): Promise<string> {
  const root = join(tmpdir(), `korri-yfs-launch-${name}-${crypto.randomUUID()}`)
  tempRoots.push(root)
  await mkdir(root, { recursive: true })
  return root
}

describe("yfs-launch", () => {
  it("parses the public command shape and YFS settings", () => {
    const parsed = parseYfsLaunchCli([
      "--webroot=/nix/store/yfs-webroot",
      "--chromium=/nix/store/chromium/bin/chromium",
      "--browser-env=XDG_RUNTIME_DIR=/run/user/2000",
      "--browser-env=WAYLAND_DISPLAY=wayland-1",
      "--audio=off",
      "--gba-sounds",
      "--quick-death",
      "--bgm-volume=7",
      "--metrics",
      "--viewport=832x832",
      "--zoom=fixed:1.5",
      "level.json",
    ])

    expect(parsed.levelFile).toBe("level.json")
    expect(parsed.runtime).toEqual({
      webroot: "/nix/store/yfs-webroot",
      chromiumPath: "/nix/store/chromium/bin/chromium",
      browserEnv: {
        XDG_RUNTIME_DIR: "/run/user/2000",
        WAYLAND_DISPLAY: "wayland-1",
      },
    })
    expect(parsed.settings).toMatchObject({
      audio: "off",
      gbaSounds: true,
      quickDeath: true,
      bgmVolume: 7,
      metrics: true,
      viewport: { width: 832, height: 832 },
      zoom: { mode: "fixed", scale: 1.5 },
    })
  })

  it("merges plugin settings from KORRI_YFS_SETTINGS with CLI flags taking precedence", () => {
    const parsed = parseYfsLaunchCli(["--bgm-volume=9", "level.json"], {
      KORRI_YFS_SETTINGS: JSON.stringify({
        metrics: true,
        bgmVolume: 3,
        sfxVolume: 4,
        viewport: { aspect: "1:1", policy: "expand-only" },
        zoom: { mode: "auto-area", multiplier: 1.1 },
      }),
    })

    expect(parsed.settings).toEqual({
      metrics: true,
      bgmVolume: 9,
      sfxVolume: 4,
      viewport: { aspect: "1:1", policy: "expand-only" },
      zoom: { mode: "auto-area", multiplier: 1.1 },
    })
  })

  it("builds a prepared-root file URL with code_url=level.json and settings", async () => {
    const root = await tempRoot("prepared")
    const url = buildYfsLaunchUrl(root, {
      metrics: true,
      bgmVolume: 5,
      viewport: { aspect: "1:1", policy: "expand-only" },
      zoom: { mode: "auto-area", multiplier: 1 },
    })

    expect(url).toContain("file://")
    expect(url).toContain("/index.html?")
    expect(url).toContain("code_url=level.json")
    expect(url).toContain("metrics=1")
    expect(url).toContain("bgm_volume=5")
    expect(url).toContain("viewport_width=832")
    expect(url).toContain("viewport_height=832")
    expect(url).toContain("zoom_mode=auto_area")
    expect(url).toContain("zoom_scale=1.363")
    expect(url).toContain("zoom_multiplier=1")
  })

  it("uses the packaged YFS direct-launch seam instead of duplicate shims", () => {
    expect(yfsShimPaths()).toEqual([])
  })

  it("does not use CDP mouse clicks to open the YFS load UI", () => {
    expect(yfsLaunchSource).not.toContain("Input.dispatchMouseEvent")
    expect(yfsLaunchSource).not.toContain("openYfsLoadUi")
  })

  it("terminates a launched browser when pre-ready observation fails", async () => {
    const marker = join(await tempRoot("proc"), "terminated")
    const proc = Bun.spawn([
      "sh",
      "-c",
      `trap 'printf done > ${marker}; exit 0' TERM; while true; do sleep 1; done`,
    ])

    await Bun.sleep(50)
    await terminateBrowserForFailedLaunch(proc, 1000)
    expect(await Bun.file(marker).exists()).toBe(true)
    expect(await proc.exited).toBe(0)
  })

  it("rejects missing level argument", () => {
    expect(() => parseYfsLaunchCli([])).toThrow(
      "usage: yfs-launch <level-file>",
    )
  })
})
