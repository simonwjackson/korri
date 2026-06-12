import { describe, expect, it } from "bun:test"
import { SourceCandidatePlayable } from "@platform/protocol/acquisition/candidate"
import { Schema } from "effect"
import { sourceCandidatePlayableToLibraryItem } from "./source-candidate-adapter"

describe("sourceCandidatePlayableToLibraryItem", () => {
  it("accepts release-shaped candidates that have a launchable target", () => {
    const candidate = Schema.decodeUnknownSync(SourceCandidatePlayable)({
      id: "downwell",
      title: "Downwell",
      source: "steam",
      releases: [
        {
          id: "steam",
          source: "steam",
          system: "windows",
          target: "steam://rungameid/360740",
          apps: [{ id: "steam" }],
        },
      ],
    })

    expect(sourceCandidatePlayableToLibraryItem(candidate)).toEqual(candidate)
  })

  it("rejects metadata-only candidates when saving to the library", () => {
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

    expect(() => sourceCandidatePlayableToLibraryItem(metadataOnly)).toThrow(
      /at least one launchable release target/,
    )
  })
})
