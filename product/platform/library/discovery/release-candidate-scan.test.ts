import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { decodeLibraryItemPayload } from "@platform/library/config/records/library-item"
import { decodeStoragePayload } from "@platform/library/config/records/storage"
import { releaseDiscoveryProvider } from "@platform/plugin/discovery"
import { openKorriConfigGraph } from "@platform/library/proseql/config-graph-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { createFirstPartyPluginRegistryFromEnv } from "@product/plugins"
import { retroarchReadableLaunchIntegration } from "@product/plugins/retroarch"
import { Effect } from "effect"
import { parse } from "yaml"
import {
  mergeReleaseCandidateConfig,
  scanAndMergeReleaseCandidates,
  scanConfiguredReleaseCandidates,
  scanReleaseCandidates,
} from "./release-candidate-scan"
import {
  classifyRomScanPath,
  createRomLibraryCandidatesFromClassifications,
} from "./rom-scan-classifier"

const testGbaDiscoveryProvider = releaseDiscoveryProvider({
  id: "@korri:test/gba-files",
  title: "Test GBA files",
  discover: ({ files }) =>
    files
      .filter(file => file.extension === ".gba")
      .map(file => ({
        kind: "file-release",
        confidence: "high",
        source: file,
        release: {
          id: "gba",
          system: "gba",
          app: "@korri:retroarch/retroarch",
          runtime: "@korri:retroarch/mgba",
        },
        evidence: [{ kind: "extension", value: ".gba" }],
      })),
})
const testGbaDiscoveryProviders = [testGbaDiscoveryProvider]

function firstSeenAtForLibraryPayload(item: unknown): string | undefined {
  const target = decodeLibraryItemPayload(item).releases[0]?.target
  if (target?.kind !== "file") return undefined
  return target.discovery?.["first-seen-at"]
}

describe("classifyRomScanPath", () => {
  it("reports GBA files as unclaimed without embedding RetroArch launch ids", () => {
    expect(classifyRomScanPath("gba/Metroid Fusion.gba")).toMatchObject({
      _tag: "Unclaimed",
      system: "gba",
      reason: "unclaimed:gba",
    })
    expect(classifyRomScanPath("Metroid Fusion.gba")).toMatchObject({
      _tag: "Unclaimed",
      system: "gba",
      reason: "unclaimed:gba",
    })
    expect(classifyRomScanPath("incoming/Metroid Fusion.gba")).toMatchObject({
      _tag: "Unclaimed",
      system: "gba",
      reason: "unclaimed:gba",
    })
  })

  it("does not let parent mount path names trigger exclusions", () => {
    expect(
      classifyRomScanPath("/run/media/korri/card/roms/gba/Metroid Fusion.gba", {
        root: "/run/media/korri/card/roms",
      }),
    ).toMatchObject({ _tag: "Unclaimed", system: "gba" })
    expect(
      classifyRomScanPath("/tmp/root/..roms/gba/Game.gba", {
        root: "/tmp/root",
      }),
    ).toMatchObject({
      _tag: "Unclaimed",
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
    const candidates = createRomLibraryCandidatesFromClassifications(
      [
        {
          _tag: "Candidate",
          path: "gba/Metroid Fusion (USA, Australia).gba",
          system: "gba",
          confidence: "high",
          app: "@korri:retroarch/retroarch",
          runtime: "@korri:retroarch/mgba",
        },
      ],
      {
        storage: "sd-roms",
        firstSeenAt: "2026-06-29T12:34:56.000Z",
      },
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
              discovery: { "first-seen-at": "2026-06-29T12:34:56.000Z" },
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
    const candidates = createRomLibraryCandidatesFromClassifications(
      ["gba/Game.gba", "gba/Game (USA).gba", "gba/Game-2.gba", "gba/Game.gba"].map(
        path => ({
          _tag: "Candidate" as const,
          path,
          system: "gba",
          confidence: "high" as const,
          app: "@korri:retroarch/retroarch",
          runtime: "@korri:retroarch/mgba",
        }),
      ),
      { storage: "roms", firstSeenAt: "2026-06-29T12:34:56.000Z" },
    )

    expect(new Set(candidates.map(candidate => candidate.id)).size).toBe(4)
    expect(candidates.map(candidate => candidate.id)).toContain("game")
    expect(candidates.map(candidate => candidate.id)).toContain("game-2")
    expect(candidates.map(candidate => candidate.id)).toContain("game-3")
    const reversed = createRomLibraryCandidatesFromClassifications(
      ["gba/Game.gba", "gba/Game-2.gba", "gba/Game (USA).gba", "gba/Game.gba"].map(
        path => ({
          _tag: "Candidate" as const,
          path,
          system: "gba",
          confidence: "high" as const,
          app: "@korri:retroarch/retroarch",
          runtime: "@korri:retroarch/mgba",
        }),
      ),
      { storage: "roms", firstSeenAt: "2026-06-29T12:34:56.000Z" },
    )
    expect(candidates.map(candidate => candidate.id)).toEqual(
      reversed.map(candidate => candidate.id),
    )
    for (const candidate of candidates) {
      const target = candidate.record.releases[0]?.target
      expect(target?.kind).toBe("file")
      if (target?.kind === "file") {
        expect(target.path.startsWith("/")).toBe(false)
        expect(target.discovery?.["first-seen-at"]).toBe(
          "2026-06-29T12:34:56.000Z",
        )
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
      discoveryProviders: testGbaDiscoveryProviders,
      root: fixture.root,
      storage: "sd-roms",
      now: () => "2026-06-29T12:34:56.000Z",
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
      "# Generated by Korri release scan candidates.",
    )
    expect(result.yaml).not.toContain("Scout")
    expect(decodeStoragePayload(parsed.storage["sd-roms"]).root).toBe(
      fixture.root,
    )
    expect(Object.keys(parsed.library)).toEqual([
      "metroid-fusion",
      "metroid-zero-mission",
    ])
    const metroid = decodeLibraryItemPayload(parsed.library["metroid-fusion"])
    expect(metroid.releases[0]?.target).toMatchObject({
      discovery: { "first-seen-at": "2026-06-29T12:34:56.000Z" },
    })
  })

  it("reports unclaimed GBA files when no discovery provider is enabled", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Fusion.gba": "",
    })

    const result = await scanReleaseCandidates({
      discoveryProviders: [],
      root: fixture.root,
      storage: "roms",
      now: () => "2026-06-29T12:34:56.000Z",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.report).toMatchObject({
      files: 1,
      candidates: 0,
      unclaimed: 1,
      conflicting: 0,
    })
    expect(result.report.samples).toContainEqual({
      path: "Metroid Fusion.gba",
      tag: "Unclaimed",
      detail: "unclaimed:gba",
    })
    const parsed = parse(result.yaml) as { readonly library: Record<string, unknown> }
    expect(parsed.library).toEqual({})
  })

  it("reports conflicting provider observations without writing either candidate", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Fusion.gba": "",
    })
    const alternateProvider = releaseDiscoveryProvider({
      id: "@korri:other/gba-files",
      title: "Other GBA files",
      discover: ({ files }) =>
        files.map(file => ({
          kind: "file-release",
          confidence: "high",
          source: file,
          release: {
            id: "gba",
            system: "gba",
            app: "@korri:other/app",
            runtime: "@korri:other/runtime",
          },
        })),
    })

    const result = await scanReleaseCandidates({
      discoveryProviders: [testGbaDiscoveryProvider, alternateProvider],
      root: fixture.root,
      storage: "roms",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.report).toMatchObject({
      files: 1,
      candidates: 0,
      conflicting: 1,
    })
    expect(result.report.samples).toContainEqual({
      path: "Metroid Fusion.gba",
      tag: "Conflicting",
      detail: "@korri:other/gba-files,@korri:test/gba-files",
    })
    const parsed = parse(result.yaml) as { readonly library: Record<string, unknown> }
    expect(parsed.library).toEqual({})
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
      discoveryProviders: testGbaDiscoveryProviders,
      root: first.root,
      storage: "roms",
      now: () => "2026-06-29T12:34:56.000Z",
    })
    const secondResult = await scanReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      root: second.root,
      storage: "roms",
      now: () => "2026-06-29T12:34:56.000Z",
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

  it("uses a provided find binary instead of ambient command lookup", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Fusion.gba": "",
    })
    const realFind = resolveFromPath("find")
    const marker = join(fixture.root, "find-shim-called.txt")
    const shim = join(fixture.root, "find-shim.sh")
    await writeFile(
      shim,
      [
        "#!/bin/sh",
        `echo "$0 $*" > ${JSON.stringify(marker)}`,
        `exec ${JSON.stringify(realFind)} "$@"`,
        "",
      ].join("\n"),
      "utf8",
    )
    await chmod(shim, 0o755)

    const result = await scanReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      root: fixture.root,
      storage: "roms",
      findBinary: shim,
    })

    expect(result.status).toBe("ok")
    expect(await readFile(marker, "utf8")).toContain(fixture.root)
  })

  it("succeeds for an empty root", async () => {
    await using fixture = await withTempRomRoot({})

    const result = await scanReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
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
      discoveryProviders: testGbaDiscoveryProviders,
      root: "/definitely/missing/korri/roms",
      storage: "roms",
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.reason).toBe("ScanFailed")
      expect(result.message).toContain("find")
    }
  })

  it("bounds find runtime with a scan timeout", async () => {
    await using fixture = await withTempRomRoot({})
    const shim = join(fixture.root, "slow-find.sh")
    await writeFile(
      shim,
      ["#!/bin/sh", "while :; do :; done", ""].join("\n"),
      "utf8",
    )
    await chmod(shim, 0o755)

    const result = await scanReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      root: fixture.root,
      storage: "roms",
      findBinary: shim,
      timeoutMs: 25,
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.message).toContain("timed out")
    }
  })
})

describe("scanConfiguredReleaseCandidates", () => {
  it("scans storage roots declared by the effective config graph", async () => {
    await using fixture = await withTempRomRoot({
      "roms/Metroid Fusion.gba": "",
    })
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  sd-releases:",
        `    root: ${join(fixture.root, "roms")}`,
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [{ root: fixture.root, optional: false }],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.scanned).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.results[0]).toMatchObject({
      storage: "sd-releases",
      status: "scanned",
      merge: { libraryAdded: 1 },
    })
    const merged = await readFile(config, "utf8")
    expect(merged).toContain("metroid-fusion")
    expect(merged).toContain("path: Metroid Fusion.gba")
  })

  it("deduplicates a configured scan against an authored same-path release and backfills identity", async () => {
    await using fixture = await withTempRomRoot({
      "roms/gba/Metroid Fusion.gba": "metroid-bytes",
    })
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  sd-releases:",
        `    root: ${join(fixture.root, "roms")}`,
        "library:",
        "  metroid-fusion-authored:",
        "    title: Authored Metroid",
        "    releases:",
        "      - id: gba",
        "        system: gba",
        "        target:",
        "          kind: file",
        "          storage: sd-releases",
        "          path: gba/Metroid Fusion.gba",
        "        launch:",
        '          use: "@korri:retroarch/retroarch"',
        '          runtime: "@korri:retroarch/mgba"',
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [{ root: fixture.root, optional: false }],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.results[0]).toMatchObject({
      storage: "sd-releases",
      status: "scanned",
      report: { deduplicated: 1 },
      merge: { libraryAdded: 0, libraryDeduplicated: 1, identityBackfilled: 1 },
    })
    const parsed = parse(await readFile(config, "utf8")) as {
      readonly library: Record<
        string,
        {
          readonly title?: string
          readonly releases?: readonly [
            { readonly identity?: { readonly value?: string } },
          ]
        }
      >
    }
    expect(Object.keys(parsed.library).sort()).toEqual([
      "metroid-fusion-authored",
    ])
    expect(parsed.library["metroid-fusion-authored"]?.title).toBe(
      "Authored Metroid",
    )
    expect(
      parsed.library["metroid-fusion-authored"]?.releases?.[0]?.identity?.value,
    ).toBe(sha256Artifact("metroid-bytes"))
  })

  it("backfills a cross-root authored release with a full local overlay", async () => {
    await using fixture = await withTempRomRoot({
      "platform/platform.korri.yaml": [
        "library:",
        "  metroid-fusion:",
        "    title: Curated Metroid",
        "    releases:",
        "      - id: gba",
        "        system: gba",
        "        target:",
        "          kind: file",
        "          storage: sd-releases",
        "          path: gba/Metroid Fusion.gba",
        "        launch:",
        '          use: "@korri:retroarch/retroarch"',
        '          runtime: "@korri:retroarch/mgba"',
        "",
      ].join("\n"),
      "roms/gba/Metroid Fusion.gba": "metroid-bytes",
    })
    const localRoot = join(fixture.root, "local")
    await mkdir(localRoot, { recursive: true })
    const config = join(localRoot, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  sd-releases:",
        `    root: ${join(fixture.root, "roms")}`,
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [
        { root: join(fixture.root, "platform"), optional: false },
        { root: localRoot, optional: false },
      ],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.results[0]).toMatchObject({
      status: "scanned",
      merge: { libraryAdded: 0, libraryDeduplicated: 1, identityBackfilled: 1 },
    })
    const local = parse(await readFile(config, "utf8")) as {
      readonly library: Record<
        string,
        {
          readonly title?: string
          readonly releases?: readonly [
            {
              readonly launch?: unknown
              readonly target?: unknown
              readonly identity?: { readonly value?: string }
            },
          ]
        }
      >
    }
    expect(local.library["metroid-fusion"]?.title).toBe("Curated Metroid")
    expect(local.library["metroid-fusion"]?.releases?.[0]?.target).toEqual({
      kind: "file",
      storage: "sd-releases",
      path: "gba/Metroid Fusion.gba",
    })
    expect(local.library["metroid-fusion"]?.releases?.[0]?.launch).toEqual({
      use: "@korri:retroarch/retroarch",
      runtime: "@korri:retroarch/mgba",
    })
    expect(
      local.library["metroid-fusion"]?.releases?.[0]?.identity?.value,
    ).toBe(sha256Artifact("metroid-bytes"))

    const loaded = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriConfigGraph({
            roots: [
              { root: join(fixture.root, "platform"), optional: false },
              { root: localRoot, optional: false },
            ],
          })
          return yield* db.library.findById("metroid-fusion")
        }),
      ),
    )
    expect(loaded.title).toBe("Curated Metroid")
    expect(loaded.releases[0]?.launch).toMatchObject({
      use: "@korri:retroarch/retroarch",
      runtime: "@korri:retroarch/mgba",
    })
  })

  it("deduplicates by existing hash identity when the scanned path changed", async () => {
    const identity = sha256Artifact("same-rom-bytes")
    await using fixture = await withTempRomRoot({
      "roms/gba/Renamed Metroid.gba": "same-rom-bytes",
    })
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  sd-releases:",
        `    root: ${join(fixture.root, "roms")}`,
        "library:",
        "  metroid-fusion-authored:",
        "    title: Authored Metroid",
        "    releases:",
        "      - id: gba",
        "        system: gba",
        "        target:",
        "          kind: file",
        "          storage: sd-releases",
        "          path: gba/Original Metroid.gba",
        "        identity:",
        "          kind: hash",
        `          value: ${identity}`,
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [{ root: fixture.root, optional: false }],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.results[0]).toMatchObject({
      status: "scanned",
      report: { deduplicated: 1 },
      merge: { libraryAdded: 0, libraryDeduplicated: 0, identityBackfilled: 0 },
    })
    const parsed = parse(await readFile(config, "utf8")) as {
      readonly library: Record<string, unknown>
    }
    expect(Object.keys(parsed.library)).toEqual(["metroid-fusion-authored"])
  })

  it("backfills identity when the target config path is relative inside an absolute root", async () => {
    const previousCwd = process.cwd()
    await using fixture = await withTempRomRoot({
      "roms/gba/Metroid Fusion.gba": "metroid-bytes",
    })
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  sd-releases:",
        `    root: ${join(fixture.root, "roms")}`,
        "library:",
        "  metroid-fusion-authored:",
        "    title: Authored Metroid",
        "    releases:",
        "      - id: gba",
        "        system: gba",
        "        target:",
        "          kind: file",
        "          storage: sd-releases",
        "          path: gba/Metroid Fusion.gba",
        "",
      ].join("\n"),
      "utf8",
    )

    try {
      process.chdir(fixture.root)
      const result = await scanAndMergeReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
        root: join(fixture.root, "roms"),
        storage: "sd-releases",
        configPath: "korri.yaml",
        roots: [{ root: fixture.root, optional: false }],
        findBinary: resolveFromPath("find"),
      })

      expect(result.status).toBe("ok")
      if (result.status !== "ok") return
      expect(result.merge).toMatchObject({
        libraryAdded: 0,
        libraryDeduplicated: 1,
        identityBackfilled: 1,
        identityBackfillSkipped: 0,
      })
    } finally {
      process.chdir(previousCwd)
    }
  })

  it("suppresses duplicates but skips backfill when the target config is outside effective roots", async () => {
    await using fixture = await withTempRomRoot({
      "platform/korri.yaml": [
        "storage:",
        "  sd-releases:",
        `    root: ${join(fixtureRootToken, "roms")}`,
        "library:",
        "  metroid-fusion:",
        "    title: Curated Metroid",
        "    releases:",
        "      - id: gba",
        "        system: gba",
        "        target:",
        "          kind: file",
        "          storage: sd-releases",
        "          path: gba/Metroid Fusion.gba",
        "",
      ].join("\n"),
      "roms/gba/Metroid Fusion.gba": "metroid-bytes",
    })
    const platformConfig = join(fixture.root, "platform", "korri.yaml")
    await writeFile(
      platformConfig,
      (await readFile(platformConfig, "utf8")).replaceAll(
        fixtureRootToken,
        fixture.root,
      ),
      "utf8",
    )
    const outConfig = join(fixture.root, "out", "korri.yaml")

    const result = await scanAndMergeReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      root: join(fixture.root, "roms"),
      storage: "sd-releases",
      configPath: outConfig,
      roots: [{ root: join(fixture.root, "platform"), optional: false }],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.merge).toMatchObject({
      libraryAdded: 0,
      libraryDeduplicated: 1,
      identityBackfilled: 0,
      identityBackfillSkipped: 1,
    })
    const parsed = parse(await readFile(outConfig, "utf8")) as {
      readonly library?: Record<string, unknown>
    }
    expect(Object.keys(parsed.library ?? {})).toHaveLength(0)
  })

  it("warns on overlapping storage roots and suppresses same-run duplicates", async () => {
    await using fixture = await withTempRomRoot({
      "roms/gba/Metroid Fusion.gba": "metroid-bytes",
    })
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  card:",
        `    root: ${fixture.root}`,
        "  roms:",
        `    root: ${join(fixture.root, "roms")}`,
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [{ root: fixture.root, optional: false }],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.results).toHaveLength(2)
    expect(
      result.results.filter(item => item.status === "scanned"),
    ).toHaveLength(2)
    expect(
      result.results.some(
        item => item.status === "scanned" && item.overlapWarnings.length > 0,
      ),
    ).toBe(true)
    expect(
      result.results
        .filter(item => item.status === "scanned")
        .reduce((total, item) => total + item.merge.libraryAdded, 0),
    ).toBe(1)
    expect(
      result.results
        .filter(item => item.status === "scanned")
        .reduce((total, item) => total + item.merge.libraryDeduplicated, 0),
    ).toBe(1)
    const parsed = parse(await readFile(config, "utf8")) as {
      readonly library: Record<string, unknown>
    }
    expect(Object.keys(parsed.library)).toHaveLength(1)
  })

  it("skips configured storage roots that are not eligible to scan", async () => {
    await using fixture = await withTempRomRoot({})
    const config = join(fixture.root, "korri.yaml")
    const missingRoot = join(fixture.root, "missing-roms")
    await writeFile(
      config,
      [
        "storage:",
        "  missing:",
        `    root: ${missingRoot}`,
        "  relative:",
        "    root: relative/roms",
        "  templated:",
        '    root: "{storage:other}/roms"',
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [{ root: fixture.root, optional: false }],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.scanned).toBe(0)
    expect(result.skipped).toBe(3)
    expect(
      result.results
        .filter(item => item.status === "skipped")
        .map(item => item.reason)
        .sort(),
    ).toEqual(["missing", "non-absolute", "unresolved-template"])
  })

  it("carries generated ids across configured storages and reserves external effective ids", async () => {
    await using fixture = await withTempRomRoot({
      "platform/platform.korri.yaml": [
        "library:",
        "  metroid-fusion:",
        "    title: Authored Metroid",
        "    releases:",
        "      - id: gba",
        "        system: gba",
        "        target:",
        "          kind: file",
        "          storage: platform",
        "          path: authored.gba",
        "        launch:",
        '          use: "@korri:retroarch/retroarch"',
        '          runtime: "@korri:retroarch/mgba"',
        "",
      ].join("\n"),
      "card-a/Metroid Fusion.gba": "",
      "card-b/Metroid Fusion.gba": "",
    })
    const localRoot = join(fixture.root, "local")
    await mkdir(localRoot, { recursive: true })
    const config = join(localRoot, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  card-a:",
        `    root: ${join(fixture.root, "card-a")}`,
        "  card-b:",
        `    root: ${join(fixture.root, "card-b")}`,
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [
        { root: join(fixture.root, "platform"), optional: false },
        { root: localRoot, optional: false },
      ],
      findBinary: resolveFromPath("find"),
      now: () => "2026-06-29T12:34:56.000Z",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.scanned).toBe(2)
    const parsed = parse(await readFile(config, "utf8")) as {
      readonly library: Record<string, unknown>
    }
    expect(Object.keys(parsed.library).sort()).toEqual([
      "metroid-fusion-2",
      "metroid-fusion-3",
    ])
    expect(
      Object.values(parsed.library).map(firstSeenAtForLibraryPayload),
    ).toEqual(["2026-06-29T12:34:56.000Z", "2026-06-29T12:34:56.000Z"])

    const second = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [
        { root: join(fixture.root, "platform"), optional: false },
        { root: localRoot, optional: false },
      ],
      findBinary: resolveFromPath("find"),
      now: () => "2030-01-01T00:00:00.000Z",
    })
    expect(second.status).toBe("ok")
    if (second.status !== "ok") return
    expect(
      second.results
        .filter(result => result.status === "scanned")
        .map(result => result.merge.libraryDeduplicated),
    ).toEqual([1, 1])
    expect(
      second.results
        .filter(result => result.status === "scanned")
        .map(result => result.merge.librarySkipped),
    ).toEqual([0, 0])
    const afterSecond = parse(await readFile(config, "utf8")) as {
      readonly library: Record<string, unknown>
    }
    expect(
      Object.values(afterSecond.library).map(firstSeenAtForLibraryPayload),
    ).toEqual(["2026-06-29T12:34:56.000Z", "2026-06-29T12:34:56.000Z"])
  })

  it("does not rewrite configured storage records while merging candidates", async () => {
    await using fixture = await withTempRomRoot({
      "roms/Metroid Fusion.gba": "",
    })
    const operatorRoot = join(fixture.root, "operator")
    await mkdir(operatorRoot, { recursive: true })
    const operatorConfig = join(operatorRoot, "operator.korri.yaml")
    await writeFile(
      operatorConfig,
      [
        "storage:",
        "  sd-releases:",
        `    root: ${join(fixture.root, "roms")}`,
        "",
      ].join("\n"),
      "utf8",
    )
    const localRoot = join(fixture.root, "local")
    await mkdir(localRoot, { recursive: true })
    const config = join(localRoot, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  sd-releases:",
        `    root: ${join(fixture.root, "old-roms")}`,
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [
        { root: localRoot, optional: false },
        { root: operatorRoot, optional: false },
      ],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.scanned).toBe(1)
    const merged = await readFile(config, "utf8")
    expect(merged).toContain(`root: ${join(fixture.root, "old-roms")}`)
    expect(merged).toContain("metroid-fusion")
  })

  it("continues configured scans after one storage scan fails", async () => {
    await using fixture = await withTempRomRoot({
      "good/Metroid Fusion.gba": "",
    })
    const badRoot = join(fixture.root, "bad")
    await mkdir(badRoot)
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  bad:",
        `    root: ${badRoot}`,
        "  good:",
        `    root: ${join(fixture.root, "good")}`,
        "",
      ].join("\n"),
      "utf8",
    )
    const failFind = join(fixture.root, "fail-on-bad-find.sh")
    await writeFile(
      failFind,
      [
        "#!/bin/sh",
        `if [ "$1" = ${JSON.stringify(badRoot)} ]; then exit 7; fi`,
        `exec ${JSON.stringify(resolveFromPath("find"))} "$@"`,
        "",
      ].join("\n"),
      "utf8",
    )
    await chmod(failFind, 0o755)

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [{ root: fixture.root, optional: false }],
      findBinary: failFind,
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.failed).toBe(1)
    expect(result.scanned).toBe(1)
    expect(result.results.map(item => item.status)).toEqual([
      "failed",
      "scanned",
    ])
    expect(await readFile(config, "utf8")).toContain("metroid-fusion")
  })

  it("does not treat restricted removable roots as storage config sources", async () => {
    await using fixture = await withTempRomRoot({
      "roms/Metroid Fusion.gba": "",
    })
    const config = join(fixture.root, "korri.yaml")
    await writeFile(
      config,
      [
        "storage:",
        "  card-owned:",
        `    root: ${join(fixture.root, "roms")}`,
        "",
      ].join("\n"),
      "utf8",
    )

    const result = await scanConfiguredReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      configPath: config,
      roots: [
        {
          root: fixture.root,
          optional: false,
          collections: ["library", "collections", "users"],
        },
      ],
      findBinary: resolveFromPath("find"),
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.scanned).toBe(0)
    expect(result.skipped).toBe(0)
    const merged = await readFile(config, "utf8")
    expect(merged).not.toContain("metroid-fusion")
  })
})

describe("mergeReleaseCandidateConfig", () => {
  it("adds missing storage and library candidates to a readable config file", async () => {
    await using fixture = await withTempRomRoot({
      "Metroid Fusion.gba": "",
    })
    const config = join(fixture.root, "korri.yaml")
    const result = await scanReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
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
      discoveryProviders: testGbaDiscoveryProviders,
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
      readonly library: Record<string, unknown>
    }
    const item = decodeLibraryItemPayload(parsed.library["metroid-fusion"])
    expect(item.title).toBe("Authored Metroid")
    expect(item.releases[0]?.target).toEqual({
      kind: "file",
      storage: "sd-releases",
      path: "Authored.gba",
    })
  })

  it("preserves hand-authored discovery metadata when skipping existing entries", async () => {
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
        "          discovery:",
        "            first-seen-at: manual-entry",
        "        launch:",
        '          use: "@korri:retroarch/retroarch"',
        '          runtime: "@korri:retroarch/mgba"',
        "",
      ].join("\n"),
      "utf8",
    )
    const result = await scanReleaseCandidates({
      discoveryProviders: testGbaDiscoveryProviders,
      root: fixture.root,
      storage: "sd-releases",
      now: () => "2026-06-29T12:34:56.000Z",
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    await mergeReleaseCandidateConfig({
      path: config,
      candidateYaml: result.yaml,
    })

    const parsed = parse(await readFile(config, "utf8")) as {
      readonly library: Record<string, unknown>
    }
    const item = decodeLibraryItemPayload(parsed.library["metroid-fusion"])
    expect(item.releases[0]?.target).toMatchObject({
      discovery: { "first-seen-at": "manual-entry" },
    })
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
      discoveryProviders: testGbaDiscoveryProviders,
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
      discoveryProviders: testGbaDiscoveryProviders,
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
    expect(loaded.item.releases[0]?.target).toMatchObject({
      kind: "file",
      storage: "sd-releases",
      path: "Metroid Fusion.gba",
      discovery: expect.objectContaining({
        "first-seen-at": expect.any(String),
      }),
    })
    expect(loaded.canResolve).toBe(true)
  })
})

const fixtureRootToken = "__KORRI_TEST_FIXTURE_ROOT__"

function sha256Artifact(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`
}

function resolveFromPath(command: string): string {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    if (directory.length === 0) continue
    const candidate = join(directory, command)
    if (Bun.file(candidate).size !== 0) return candidate
  }
  throw new Error(`could not resolve ${command} from PATH`)
}

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
