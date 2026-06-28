import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { decodeLibraryItemPayload } from "@platform/library/config/records/library-item"
import { decodeStoragePayload } from "@platform/library/config/records/storage"
import { openKorriConfigGraph } from "@platform/library/proseql/config-graph-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { createFirstPartyPluginRegistryFromEnv } from "@product/plugins"
import { retroarchReadableLaunchIntegration } from "@product/plugins/retroarch"
import { Effect } from "effect"
import { parse } from "yaml"
import {
  mergeReleaseCandidateConfig,
  scanReleaseCandidates,
} from "./release-candidate-scan"
import {
  classifyRomScanPath,
  createRomLibraryCandidates,
} from "./rom-scan-classifier"

describe("classifyRomScanPath", () => {
  it("classifies GBA files as high-confidence candidates without requiring a system folder", () => {
    expect(classifyRomScanPath("gba/Metroid Fusion.gba")).toMatchObject({
      _tag: "Candidate",
      system: "gba",
      confidence: "high",
      runtime: "@korri:retroarch/mgba",
    })
    expect(classifyRomScanPath("Metroid Fusion.gba")).toMatchObject({
      _tag: "Candidate",
      system: "gba",
      confidence: "high",
    })
    expect(classifyRomScanPath("incoming/Metroid Fusion.gba")).toMatchObject({
      _tag: "Candidate",
      system: "gba",
      confidence: "high",
    })
  })

  it("does not let parent mount path names trigger exclusions", () => {
    expect(
      classifyRomScanPath("/run/media/korri/card/roms/gba/Metroid Fusion.gba", {
        root: "/run/media/korri/card/roms",
      }),
    ).toMatchObject({ _tag: "Candidate", system: "gba" })
    expect(
      classifyRomScanPath("/tmp/root/..roms/gba/Game.gba", {
        root: "/tmp/root",
      }),
    ).toMatchObject({
      _tag: "Candidate",
      path: "..roms/gba/Game.gba",
    })
  })

  it("excludes bios, media, manuals, and save files", () => {
    expect(classifyRomScanPath("bios/GC/font_western.bin")).toMatchObject({
      _tag: "Excluded",
      reason: "path:bios",
    })
    expect(classifyRomScanPath("images/cover.png")).toMatchObject({
      _tag: "Excluded",
      reason: "path:images",
    })
    expect(classifyRomScanPath("manuals/game.pdf")).toMatchObject({
      _tag: "Excluded",
      reason: "path:manuals",
    })
    expect(classifyRomScanPath("gba/save.sav")).toMatchObject({
      _tag: "Excluded",
      reason: "extension:sav",
    })
  })

  it("reports unsupported game-like files without making them candidates", () => {
    expect(classifyRomScanPath("game.nsp")).toMatchObject({
      _tag: "Unsupported",
      system: "switch",
    })
    expect(classifyRomScanPath("game.wua")).toMatchObject({
      _tag: "Unsupported",
      system: "wiiu",
    })
    expect(classifyRomScanPath("game.rvz")).toMatchObject({
      _tag: "Unsupported",
      system: "wii",
    })
    expect(classifyRomScanPath("wii/game.iso")).toMatchObject({
      _tag: "Unsupported",
      system: "wii",
    })
    expect(classifyRomScanPath("gba/dkkc3.zip")).toMatchObject({
      _tag: "Unsupported",
      system: "gba",
    })
  })

  it("reports ignored and ambiguous paths explicitly", () => {
    expect(classifyRomScanPath("notes/readme.md")).toMatchObject({
      _tag: "Ignored",
      reason: "extension:md",
    })
    expect(classifyRomScanPath("gba/tetris.gb")).toMatchObject({
      _tag: "Ambiguous",
      reason: "folder:gba/extension:gb",
    })
    expect(classifyRomScanPath("game.iso")).toMatchObject({
      _tag: "Ambiguous",
      reason: "extension:iso",
    })
    expect(classifyRomScanPath("game.zip")).toMatchObject({
      _tag: "Ambiguous",
      reason: "extension:zip",
    })
  })
})

describe("createRomLibraryCandidates", () => {
  it("renders schema-valid readable-library records", () => {
    const candidates = createRomLibraryCandidates(
      ["gba/Metroid Fusion (USA, Australia).gba"],
      { storage: "sd-roms" },
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      id: "metroid-fusion-usa-australia",
      title: "Metroid Fusion",
      record: {
        title: "Metroid Fusion",
        releases: [
          {
            id: "gba",
            system: "gba",
            target: {
              kind: "file",
              storage: "sd-roms",
              path: "gba/Metroid Fusion (USA, Australia).gba",
            },
            launch: {
              use: "@korri:retroarch/retroarch",
              runtime: "@korri:retroarch/mgba",
            },
          },
        ],
      },
    })
    expect(() => decodeLibraryItemPayload(candidates[0]?.record)).not.toThrow()
  })

  it("keeps target paths relative and suffixes duplicate ids globally", () => {
    const candidates = createRomLibraryCandidates(
      ["gba/Game.gba", "gba/Game (USA).gba", "gba/Game-2.gba", "gba/Game.gba"],
      { storage: "roms" },
    )

    expect(new Set(candidates.map(candidate => candidate.id)).size).toBe(4)
    expect(candidates.map(candidate => candidate.id)).toContain("game")
    expect(candidates.map(candidate => candidate.id)).toContain("game-2")
    expect(candidates.map(candidate => candidate.id)).toContain("game-3")
    const reversed = createRomLibraryCandidates(
      ["gba/Game.gba", "gba/Game-2.gba", "gba/Game (USA).gba", "gba/Game.gba"],
      { storage: "roms" },
    )
    expect(candidates.map(candidate => candidate.id)).toEqual(
      reversed.map(candidate => candidate.id),
    )
    for (const candidate of candidates) {
      const target = candidate.record.releases[0]?.target
      expect(target?.kind).toBe("file")
      if (target?.kind === "file") {
        expect(target.path.startsWith("/")).toBe(false)
      }
    }
  })
})

describe("scanReleaseCandidates", () => {
  it("streams find output and reports deterministic YAML candidates", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Zero Mission.gba": "",
      "gba/Metroid Fusion.gba": "",
      "gba/save.sav": "",
      "images/cover.png": "",
      "switch/Game.nsp": "",
      "gba/tetris.gb": "",
      "notes/readme.md": "",
    })

    const result = await scanReleaseCandidates({
      root: fixture.root,
      storage: "sd-roms",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.report).toMatchObject({
      files: 7,
      candidates: 2,
      excluded: 2,
      unsupported: 1,
      ignored: 1,
      ambiguous: 1,
    })
    const parsed = parse(result.yaml) as {
      readonly storage: Record<string, unknown>
      readonly library: Record<string, unknown>
    }
    expect(result.yaml).toStartWith(
      "# Generated by Korri Scout from release scan candidates.",
    )
    expect(decodeStoragePayload(parsed.storage["sd-roms"]).root).toBe(
      fixture.root,
    )
    expect(Object.keys(parsed.library)).toEqual([
      "metroid-fusion",
      "metroid-zero-mission",
    ])
    expect(() =>
      decodeLibraryItemPayload(parsed.library["metroid-fusion"]),
    ).not.toThrow()
  })

  it("renders deterministic YAML for repeated scans with different file creation order", async () => {
    await using first = await withTempRomRoot({
      "gba/Zelda.gba": "",
      "gba/Metroid.gba": "",
    })
    await using second = await withTempRomRoot({
      "gba/Metroid.gba": "",
      "gba/Zelda.gba": "",
    })

    const firstResult = await scanReleaseCandidates({
      root: first.root,
      storage: "roms",
    })
    const secondResult = await scanReleaseCandidates({
      root: second.root,
      storage: "roms",
    })

    expect(firstResult.status).toBe("ok")
    expect(secondResult.status).toBe("ok")
    if (firstResult.status !== "ok" || secondResult.status !== "ok") return
    const firstParsed = parse(firstResult.yaml) as {
      readonly library: Record<string, unknown>
    }
    const secondParsed = parse(secondResult.yaml) as {
      readonly library: Record<string, unknown>
    }
    expect(firstParsed.library).toEqual(secondParsed.library)
  })

  it("succeeds for an empty root", async () => {
    await using fixture = await withTempRomRoot({})

    const result = await scanReleaseCandidates({
      root: fixture.root,
      storage: "roms",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.report.files).toBe(0)
    expect(result.report.candidates).toBe(0)
    expect(parse(result.yaml)).toEqual({
      storage: { roms: { root: fixture.root } },
      library: {},
    })
  })

  it("reports missing roots as scanner diagnostics", async () => {
    const result = await scanReleaseCandidates({
      root: "/definitely/missing/korri/roms",
      storage: "roms",
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.reason).toBe("ScanFailed")
      expect(result.message).toContain("find")
    }
  })
})

describe("mergeReleaseCandidateConfig", () => {
  it("adds missing storage and library candidates to a readable config file", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Fusion.gba": "",
    })
    const config = join(fixture.root, "korri.yaml")
    const result = await scanReleaseCandidates({
      root: fixture.root,
      storage: "sd-releases",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    const merge = await mergeReleaseCandidateConfig({
      path: config,
      candidateYaml: result.yaml,
    })

    expect(merge).toMatchObject({
      storageAdded: 1,
      storageSkipped: 0,
      libraryAdded: 1,
      librarySkipped: 0,
    })
    const generated = await readFile(config, "utf8")
    const parsed = parse(generated) as {
      readonly storage: Record<string, unknown>
      readonly library: Record<string, unknown>
    }
    expect(decodeStoragePayload(parsed.storage["sd-releases"]).root).toBe(
      fixture.root,
    )
    expect(() =>
      decodeLibraryItemPayload(parsed.library["metroid-fusion"]),
    ).not.toThrow()
  })

  it("skips existing library entries instead of overwriting them", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Fusion.gba": "",
    })
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  sd-releases:",
        `    root: ${fixture.root}`,
        "library:",
        "  metroid-fusion:",
        "    title: Authored Metroid",
        "    releases:",
        "      - id: gba",
        "        system: gba",
        "        target:",
        "          kind: file",
        "          storage: sd-releases",
        "          path: Authored.gba",
        "        launch:",
        '          use: "@korri:retroarch/retroarch"',
        '          runtime: "@korri:retroarch/mgba"',
        "",
      ].join("\n"),
      "utf8",
    )
    const result = await scanReleaseCandidates({
      root: fixture.root,
      storage: "sd-releases",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    const merge = await mergeReleaseCandidateConfig({
      path: config,
      candidateYaml: result.yaml,
    })

    expect(merge.libraryAdded).toBe(0)
    expect(merge.librarySkipped).toBe(1)
    const parsed = parse(await readFile(config, "utf8")) as {
      readonly library: Record<string, { readonly title?: string }>
    }
    expect(parsed.library["metroid-fusion"]?.title).toBe("Authored Metroid")
  })

  it("rejects conflicting storage ids instead of rewriting them", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Fusion.gba": "",
    })
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      ["storage:", "  sd-releases:", "    root: /somewhere-else", ""].join(
        "\n",
      ),
      "utf8",
    )
    const result = await scanReleaseCandidates({
      root: fixture.root,
      storage: "sd-releases",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    await expect(
      mergeReleaseCandidateConfig({ path: config, candidateYaml: result.yaml }),
    ).rejects.toThrow("already exists with different values")
  })

  it("loads the merged default config through the config graph and resolves a launch", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Fusion.gba": "",
    })
    const config = join(fixture.root, "korri.yaml")
    const result = await scanReleaseCandidates({
      root: fixture.root,
      storage: "sd-releases",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    await mergeReleaseCandidateConfig({
      path: config,
      candidateYaml: result.yaml,
    })
    const loaded = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriConfigGraph({
            roots: [{ root: fixture.root, optional: false }],
          })
          const repository = createLibraryRepository(db, {
            env: {
              KORRI_LAUNCH_ARTIFACTS_DIR: join(
                fixture.root,
                "launch-artifacts",
              ),
            },
            launchIntegrations: [retroarchReadableLaunchIntegration],
            pluginRegistry: createFirstPartyPluginRegistryFromEnv({
              KORRI_ENABLED_PLUGINS: "@korri:retroarch",
            }),
          })
          const [storage, item, canResolve] = yield* Effect.all([
            db.storage.findById("sd-releases"),
            db.library.findById("metroid-fusion"),
            repository.canResolveLaunchForPlayable("metroid-fusion"),
          ])
          return { storage, item, canResolve }
        }),
      ),
    )

    expect(loaded.storage.root).toBe(fixture.root)
    expect(loaded.item.releases[0]?.target).toEqual({
      kind: "file",
      storage: "sd-releases",
      path: "Metroid Fusion.gba",
    })
    expect(loaded.canResolve).toBe(true)
  })
})

async function withTempRomRoot(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "korri-rom-scan-"))
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, "utf8")
  }
  return {
    root,
    async [Symbol.asyncDispose]() {
      await rm(root, { recursive: true, force: true })
    },
  }
}
