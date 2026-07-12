import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "yaml"
import {
  applyClaimMetadataToImport,
  scoutMergeConfigPath,
} from "./acquire-placement"

async function withTempConfig<T>(
  yamlText: string,
  fn: (configPath: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "korri-acquire-metadata-"))
  const configPath = join(dir, "korri.yaml")
  await writeFile(configPath, yamlText)
  try {
    return await fn(configPath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const importedYaml = [
  "library:",
  "  dank-tomb-0:",
  "    title: dank tomb 0",
  "    releases:",
  "      - id: pico8",
  "        system: pico8",
  "        target:",
  "          kind: file",
  "          storage: roms",
  "          path: pico8/dank_tomb-0.p8.png",
  "",
].join("\n")

describe("applyClaimMetadataToImport", () => {
  it("applies the claim title and tile art to the imported entry", async () => {
    await withTempConfig(importedYaml, async configPath => {
      const changed = await applyClaimMetadataToImport({
        configPath,
        storageId: "roms",
        relativePath: "pico8/dank_tomb-0.p8.png",
        title: "Dank Tomb 1.1b",
        artUrl: "https://img.example.com/dank-tomb.png",
        claimUrl: "https://www.lexaloffle.com/bbs/?pid=42",
      })
      expect(changed).toBe(true)

      const doc = parse(await readFile(configPath, "utf8"))
      const entry = doc.library["dank-tomb-0"]
      expect(entry.title).toBe("Dank Tomb 1.1b")
      expect(entry.metadata.media).toEqual([
        {
          type: "image",
          uri: "https://img.example.com/dank-tomb.png",
          role: "tile",
          source: {
            provider: "korri",
            url: "https://www.lexaloffle.com/bbs/?pid=42",
          },
        },
      ])
    })
  })

  it("does not clobber an existing tile image", async () => {
    const authored = importedYaml.replace(
      "    releases:",
      [
        "    metadata:",
        "      media:",
        "        - type: image",
        "          uri: https://authored.example.com/tile.png",
        "          role: tile",
        "    releases:",
      ].join("\n"),
    )
    await withTempConfig(authored, async configPath => {
      await applyClaimMetadataToImport({
        configPath,
        storageId: "roms",
        relativePath: "pico8/dank_tomb-0.p8.png",
        artUrl: "https://img.example.com/other.png",
      })
      const doc = parse(await readFile(configPath, "utf8"))
      expect(doc.library["dank-tomb-0"].metadata.media).toHaveLength(1)
      expect(doc.library["dank-tomb-0"].metadata.media[0].uri).toBe(
        "https://authored.example.com/tile.png",
      )
    })
  })

  it("returns false when no entry matches the placed target", async () => {
    await withTempConfig(importedYaml, async configPath => {
      const changed = await applyClaimMetadataToImport({
        configPath,
        storageId: "roms",
        relativePath: "gba/other.gba",
        title: "Other",
      })
      expect(changed).toBe(false)
    })
  })
})

describe("scoutMergeConfigPath", () => {
  it("prefers the explicit override, then the first writable config root", () => {
    expect(
      scoutMergeConfigPath({ KORRI_SCOUT_CONFIG_PATH: "/etc/x/korri.yaml" }),
    ).toBe("/etc/x/korri.yaml")
    expect(
      scoutMergeConfigPath({
        KORRI_CONFIG_ROOTS: "/nix/store/aaa-platform:/var/lib/korri/config",
      }),
    ).toBe("/var/lib/korri/config/korri.yaml")
  })
})
