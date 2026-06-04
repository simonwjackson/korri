import { describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import path from "node:path"
import { makeOutTempDir } from "../make-out-temp-dir"
import {
  isDemoSceneAnchor,
  loadDemoStoryboard,
  parseDemoStoryboardSource,
} from "./demo-storyboard"

const validStoryboard = `demo: launcher-overview
recording:
  start: after-step-1
scenes:
  after-step-1:
    scene: welcome
    durationMs: 7900
    narration: |
      Korri loads your library from a local seed.
    overlay:
      type: headline-card
      title: Reproducible from seed data
      placement: bottom-center
`

describe("demo storyboard parsing", () => {
  test("parses presentation metadata from YAML", () => {
    const storyboard = parseDemoStoryboardSource(
      validStoryboard,
      "launcher-overview.demo.yaml",
      "launcher-overview",
    )

    expect(storyboard).toMatchObject({
      demo: "launcher-overview",
      recording: { start: "after-step-1" },
      scenes: [
        {
          anchor: "after-step-1",
          scene: "welcome",
          text: "Korri loads your library from a local seed.\n",
          durationMs: 7900,
          overlay: {
            type: "headline-card",
            title: "Reproducible from seed data",
            placement: "bottom-center",
          },
        },
      ],
    })
  })

  test("returns defaults when the storyboard file is absent", () => {
    const tempDir = makeOutTempDir("storyboard-")
    try {
      const storyboard = loadDemoStoryboard(
        path.join(tempDir, "missing.demo.yaml"),
        "missing",
      )

      expect(storyboard).toEqual({
        demo: "missing",
        sourcePath: undefined,
        recording: { start: undefined },
        scenes: [],
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test("validates scene anchor syntax", () => {
    expect(isDemoSceneAnchor("before-step-2")).toBe(true)
    expect(isDemoSceneAnchor("after-step-2")).toBe(true)
    expect(isDemoSceneAnchor("step-2")).toBe(true)
    expect(isDemoSceneAnchor("during-step-2")).toBe(false)
  })

  test("rejects unknown scene anchor formats with the file path", () => {
    expect(() =>
      parseDemoStoryboardSource(
        `demo: launcher-overview
scenes:
  during-step-2:
    scene: welcome
`,
        "launcher-overview.demo.yaml",
        "launcher-overview",
      ),
    ).toThrow(/launcher-overview\.demo\.yaml.*during-step-2/)
  })

  test("rejects malformed YAML with the file path", () => {
    expect(() =>
      parseDemoStoryboardSource(
        "demo: [",
        "broken.demo.yaml",
        "launcher-overview",
      ),
    ).toThrow(/Failed to parse demo storyboard broken\.demo\.yaml/)
  })

  test("rejects behavior-shaped fields", () => {
    expect(() =>
      parseDemoStoryboardSource(
        `demo: launcher-overview
scenes:
  after-step-1:
    scene: welcome
    click: button
`,
        "launcher-overview.demo.yaml",
        "launcher-overview",
      ),
    ).toThrow(/must not define behavior field .*click/)
  })

  test("rejects local-demo unsafe narration", () => {
    expect(() =>
      parseDemoStoryboardSource(
        `demo: launcher-overview
scenes:
  after-step-1:
    scene: welcome
    narration: Do not put customer tokens in narration.
`,
        "launcher-overview.demo.yaml",
        "launcher-overview",
      ),
    ).toThrow(/local-demo unsafe narration/)
  })

  test("rejects demo name mismatches", () => {
    expect(() =>
      parseDemoStoryboardSource(
        validStoryboard,
        "launcher-overview.demo.yaml",
        "different-demo",
      ),
    ).toThrow(/declares demo "launcher-overview" but expected "different-demo"/)
  })

  test("rejects unknown root fields", () => {
    expect(() =>
      parseDemoStoryboardSource(
        `demo: launcher-overview
extras:
  - unsupported
`,
        "launcher-overview.demo.yaml",
        "launcher-overview",
      ),
    ).toThrow(/unsupported field storyboard\.extras/)
  })

  test("requires positive integer durationMs", () => {
    expect(() =>
      parseDemoStoryboardSource(
        `demo: launcher-overview
scenes:
  after-step-1:
    scene: welcome
    durationMs: -1
`,
        "launcher-overview.demo.yaml",
        "launcher-overview",
      ),
    ).toThrow(/durationMs must be a positive integer/)
  })
})
