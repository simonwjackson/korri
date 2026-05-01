import { describe, expect, test } from "bun:test"
import { buildAudioPlacements, buildTtsClipPath } from "./narration-audio"

describe("demo video narration audio", () => {
  test("matches Argo TTS clip cache paths", () => {
    expect(
      buildTtsClipPath("local-login", {
        scene: "welcome",
        text: "Amaze runs from a complete local stack, including the portal, API, database, and local authentication.",
        voice: "af_heart",
        speed: 1,
      }),
    ).toBe(
      ".argo/local-login/clips/0b5c1ebdb99680880e567313e4652a6e8e9e353d184f4b05a22ea5fab34dff41.wav",
    )
  })

  test("keeps voiceover clips ordered without overlap", () => {
    const placements = buildAudioPlacements(
      { intro: 0, followUp: 500, final: 3_000 },
      [
        { scene: "followUp", path: "follow-up.wav", durationMs: 1_000 },
        { scene: "intro", path: "intro.wav", durationMs: 1_200 },
        { scene: "final", path: "final.wav", durationMs: 700 },
      ],
    )

    expect(placements).toEqual([
      { scene: "intro", clipPath: "intro.wav", startMs: 0, endMs: 1_200 },
      {
        scene: "followUp",
        clipPath: "follow-up.wav",
        startMs: 1_300,
        endMs: 2_300,
      },
      { scene: "final", clipPath: "final.wav", startMs: 3_000, endMs: 3_700 },
    ])
  })
})
