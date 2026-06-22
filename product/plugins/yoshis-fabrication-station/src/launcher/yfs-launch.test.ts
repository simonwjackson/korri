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
      "--audio=off",
      "--gba-sounds",
      "--quick-death",
      "--bgm-volume=7",
      "--metrics",
      "level.json",
    ])

    expect(parsed.levelFile).toBe("level.json")
    expect(parsed.settings).toMatchObject({
      audio: "off",
      gbaSounds: true,
      quickDeath: true,
      bgmVolume: 7,
      metrics: true,
    })
  })

  it("merges plugin settings from KORRI_YFS_SETTINGS with CLI flags taking precedence", () => {
    const parsed = parseYfsLaunchCli(["--bgm-volume=9", "level.json"], {
      KORRI_YFS_SETTINGS: JSON.stringify({
        metrics: true,
        bgmVolume: 3,
        sfxVolume: 4,
      }),
    })

    expect(parsed.settings).toEqual({
      metrics: true,
      bgmVolume: 9,
      sfxVolume: 4,
    })
  })

  it("builds a prepared-root file URL with code_url=level.json and settings", async () => {
    const root = await tempRoot("prepared")
    const url = buildYfsLaunchUrl(root, { metrics: true, bgmVolume: 5 })

    expect(url).toContain("file://")
    expect(url).toContain("/index.html?")
    expect(url).toContain("code_url=level.json")
    expect(url).toContain("metrics=1")
    expect(url).toContain("bgm_volume=5")
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
