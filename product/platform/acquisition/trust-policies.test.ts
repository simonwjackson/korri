import { describe, expect, it } from "bun:test"
import { SourceCandidate } from "@platform/protocol/acquisition/candidate"
import { Schema } from "effect"
import { safeAcquisitionLogFields } from "./logger"
import { resolveContainedArtifactPath } from "./path-policy"
import { redactCredentialText } from "./security"
import { validateSourceName } from "./source-names"

describe("acquisition trust policies", () => {
  it("redacts credentials from logs and payload strings", () => {
    expect(redactCredentialText("token=secret&x=1")).toContain(
      "token=[REDACTED]",
    )
    expect(
      safeAcquisitionLogFields({ error: "Authorization: Bearer abc123" }).error,
    ).toBe("Authorization: Bearer [REDACTED]")
    expect(
      safeAcquisitionLogFields({ error: "Authorization: Basic abc123" }).error,
    ).toBe("Authorization: Basic [REDACTED]")
    expect(
      safeAcquisitionLogFields({ error: new Error("api_key=secret") }).error,
    ).toBe("api_key=[REDACTED]")
    expect(
      (
        safeAcquisitionLogFields({ meta: { token: "token=secret" } }).meta as {
          token: string
        }
      ).token,
    ).toBe("[REDACTED]")
    expect(safeAcquisitionLogFields({ apiKey: "raw-secret" }).apiKey).toBe(
      "[REDACTED]",
    )
  })

  it("contains artifact paths inside the staging root", () => {
    const resolved = resolveContainedArtifactPath(
      "/tmp/acquisition",
      "itchio/game.zip",
    )
    expect(resolved).toBe("/tmp/acquisition/itchio/game.zip")
    expect(() =>
      resolveContainedArtifactPath("/tmp/acquisition", "../secret"),
    ).toThrow()
    expect(() =>
      resolveContainedArtifactPath("/tmp/acquisition", "/etc/passwd"),
    ).toThrow()
    expect(() =>
      resolveContainedArtifactPath("/tmp/acquisition", "bad\0path"),
    ).toThrow()
  })

  it("canonicalizes bounded source names before use", () => {
    expect(validateSourceName(" Itch_IO ")).toBe("itch-io")
    expect(() => validateSourceName("../itchio")).toThrow()
  })

  it("turns schema-violating plugin outputs into detectable defects", () => {
    expect(() =>
      Schema.decodeUnknownSync(SourceCandidate)({
        _tag: "SourceCandidate",
        sourceName: "itchio",
        id: "game-1",
        url: "https://example.com/game",
      }),
    ).toThrow()
  })
})
