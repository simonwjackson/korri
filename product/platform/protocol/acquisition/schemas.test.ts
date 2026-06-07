import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { SearchResponse, SourceCandidatePlayable } from "./candidate"
import { DownloadResolution } from "./download-resolution"
import { PluginMetadata } from "./plugin"
import { SourceHealth } from "./source-health"

it("decodes representative acquisition protocol payloads", () => {
  expect(
    Schema.decodeUnknownSync(SearchResponse)({
      candidates: [
        {
          _tag: "SourceCandidate",
          sourceName: "itchio",
          id: "game-1",
          title: "Game One",
          url: "https://example.com/game-1",
          platform: "gb",
          artifact: {
            kind: "content",
            system: "gb",
            format: { id: "gb-rom" },
            file: { name: "game.gb", extension: "gb" },
          },
        },
        {
          _tag: "SourceCandidate",
          sourceName: "chip8archive",
          id: "octojam1title",
          title: "Octojam 1 Title",
          url: "https://johnearnest.github.io/chip8Archive/play.html?p=octojam1title",
          platform: "chip8",
        },
      ],
    }).candidates[0]?.sourceName,
  ).toBe("itchio")

  expect(
    Schema.decodeUnknownSync(SearchResponse)({
      candidates: [
        {
          _tag: "SourceCandidate",
          sourceName: "levelsharesquare",
          id: "6a1797b85a07d826fd7a5bd0",
          title: "Tropical Island Adventure!",
          url: "https://levelsharesquare.com/levels/6a1797b85a07d826fd7a5bd0",
          platform: "smbr",
          artifact: {
            kind: "content",
            system: "smbr",
            format: { id: "smbr-level" },
            file: { name: "6a1797b85a07d826fd7a5bd0.lvl", extension: "lvl" },
          },
        },
      ],
    }).candidates[0]?.artifact?.format.id,
  ).toBe("smbr-level")

  expect(
    Schema.decodeUnknownSync(SourceHealth)({
      _tag: "UnhealthySource",
      sourceName: "itchio",
      checkedAt: "2026-06-04T00:00:00.000Z",
      reason: "credentials",
      message: "Token rejected",
    })._tag,
  ).toBe("UnhealthySource")

  expect(
    Schema.decodeUnknownSync(DownloadResolution)({
      _tag: "NonFinalDownload",
      sourceName: "itchio",
      reason: "interstitial",
      url: "https://example.com/download",
    })._tag,
  ).toBe("NonFinalDownload")

  expect(
    Schema.decodeUnknownSync(PluginMetadata)({
      sourceName: "itchio",
      displayName: "itch.io",
      module: "product/platform/acquisition/plugins/itchio",
      builtIn: true,
      enabledByDefault: true,
      legalRisk: "medium",
      credentialRequired: false,
    }).builtIn,
  ).toBe(true)
})

describe("source candidate playable shape", () => {
  it("decodes release-shaped service candidates with URI targets", () => {
    const decoded = Schema.decodeUnknownSync(SearchResponse)({
      candidates: [
        {
          _tag: "SourceCandidate",
          sourceName: "steam",
          id: "360740",
          title: "Downwell",
          url: "https://store.steampowered.com/app/360740",
          playable: {
            id: "downwell",
            title: "Downwell",
            source: "steam",
            releases: [
              {
                id: "steam",
                source: "steam",
                system: "windows",
                target: "steam://rungameid/360740",
                app: "steam",
              },
            ],
          },
        },
      ],
    })

    expect(decoded.candidates[0]?.playable?.releases[0]?.target).toBe(
      "steam://rungameid/360740",
    )
  })

  it("represents metadata-only candidates", () => {
    const metadataOnly = Schema.decodeUnknownSync(SourceCandidatePlayable)({
      id: "unknown-pc-release",
      title: "Unknown PC Release",
      source: "pcgamingwiki",
      releases: [
        {
          id: "pcgamingwiki",
          source: "pcgamingwiki",
          system: "windows",
        },
      ],
    })

    expect(metadataOnly.releases[0]?.target).toBeUndefined()
  })
})

describe("protocol boundary", () => {
  it("does not import Effect RPC definitions from protocol schemas", () => {
    for (const file of [
      "artifact-acquisition.ts",
      "candidate.ts",
      "download-resolution.ts",
      "errors.ts",
      "plugin.ts",
      "source-health.ts",
    ]) {
      const source = readFileSync(join(import.meta.dir, file), "utf8")
      expect(source).not.toContain("effect/unstable/rpc")
      expect(source).not.toContain("Rpc.make")
    }
  })
})
