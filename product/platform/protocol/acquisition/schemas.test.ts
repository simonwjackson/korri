import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { SearchResponse } from "./candidate"
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
        },
      ],
    }).candidates[0]?.sourceName,
  ).toBe("itchio")

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

describe("protocol boundary", () => {
  it("does not import Effect RPC definitions from protocol schemas", () => {
    for (const file of [
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
