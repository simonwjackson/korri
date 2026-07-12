import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeLibraryItemPayload } from "@platform/library/config/records/library-item"
import { parse } from "yaml"
import { applyImportMetadata, scoutMergeConfigPath } from "./acquire-placement"

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

const digest = "b".repeat(64)

describe("applyImportMetadata", () => {
  it("applies the claim title and staged digest to the imported entry", async () => {
    await withTempConfig(importedYaml, async configPath => {
      const changed = await applyImportMetadata({
        configPath,
        storageId: "roms",
        relativePath: "pico8/dank_tomb-0.p8.png",
        title: "Dank Tomb 1.1b",
        sha256: digest,
      })
      expect(changed).toBe(true)

      const doc = parse(await readFile(configPath, "utf8"))
      const entry = doc.library["dank-tomb-0"]
      expect(entry.title).toBe("Dank Tomb 1.1b")
      expect(entry.releases[0].identity).toEqual({
        kind: "hash",
        value: `sha256:${digest}`,
      })
      // Persisted metadata.media is forbidden by the readable schema; writing
      // it rejects the whole config fragment and empties the library. The
      // patch must never introduce a metadata section.
      expect(entry.metadata).toBeUndefined()
      // An invalid patched entry rejects the whole config fragment, dropping
      // every entry in the file from the library. Prove it still decodes.
      expect(() => decodeLibraryItemPayload(entry)).not.toThrow()
    })
  })

  it("writes identity alone when no title is provided", async () => {
    await withTempConfig(importedYaml, async configPath => {
      const changed = await applyImportMetadata({
        configPath,
        storageId: "roms",
        relativePath: "pico8/dank_tomb-0.p8.png",
        sha256: digest,
      })
      expect(changed).toBe(true)

      const doc = parse(await readFile(configPath, "utf8"))
      const entry = doc.library["dank-tomb-0"]
      expect(entry.title).toBe("dank tomb 0")
      expect(entry.releases[0].identity.value).toBe(`sha256:${digest}`)
    })
  })

  it("never overwrites an existing release identity", async () => {
    const withIdentity = importedYaml.replace(
      "        target:",
      [
        "        identity:",
        "          kind: hash",
        `          value: sha256:${"c".repeat(64)}`,
        "        target:",
      ].join("\n"),
    )
    await withTempConfig(withIdentity, async configPath => {
      const changed = await applyImportMetadata({
        configPath,
        storageId: "roms",
        relativePath: "pico8/dank_tomb-0.p8.png",
        sha256: digest,
      })
      expect(changed).toBe(false)

      const doc = parse(await readFile(configPath, "utf8"))
      expect(doc.library["dank-tomb-0"].releases[0].identity.value).toBe(
        `sha256:${"c".repeat(64)}`,
      )
    })
  })

  it("is a no-op when the title already matches and identity exists", async () => {
    await withTempConfig(importedYaml, async configPath => {
      const changed = await applyImportMetadata({
        configPath,
        storageId: "roms",
        relativePath: "pico8/dank_tomb-0.p8.png",
        title: "dank tomb 0",
      })
      expect(changed).toBe(false)
    })
  })

  it("returns false when no entry matches the placed target", async () => {
    await withTempConfig(importedYaml, async configPath => {
      const changed = await applyImportMetadata({
        configPath,
        storageId: "roms",
        relativePath: "gba/other.gba",
        title: "Other",
        sha256: digest,
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
