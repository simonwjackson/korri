import { describe, expect, it } from "bun:test"
import { classifyEngine, type PageFingerprint } from "./engine-detect"

const fp = (p: Partial<PageFingerprint>): PageFingerprint => ({
  globals: [],
  title: "",
  canvasIds: [],
  scriptSrcs: [],
  ...p,
})

describe("classifyEngine", () => {
  it("classifies GameMaker from the document title alone", () => {
    // Stargrove's real signal this session: title === "Created with GameMaker Studio 2"
    expect(classifyEngine(fp({ title: "Created with GameMaker Studio 2" }))).toBe(
      "gamemaker",
    )
  })

  it("classifies GameMaker from a runtime global", () => {
    expect(classifyEngine(fp({ globals: ["GameMaker_Init"] }))).toBe("gamemaker")
  })

  it("classifies Construct 3 from the C3 global or c3main script", () => {
    expect(classifyEngine(fp({ globals: ["C3"] }))).toBe("construct")
    expect(
      classifyEngine(fp({ scriptSrcs: ["https://x/scripts/c3main.js"] })),
    ).toBe("construct")
  })

  it("classifies Unity WebGL from its loader global", () => {
    expect(classifyEngine(fp({ globals: ["createUnityInstance"] }))).toBe("unity")
  })

  it("prefers a high-confidence match over a medium one", () => {
    // Module (emscripten, medium) is present, but C3 (high) should win
    expect(classifyEngine(fp({ globals: ["Module", "C3"] }))).toBe("construct")
  })

  it("falls back to generic for unknown pages", () => {
    expect(classifyEngine(fp({ globals: ["somethingElse"], title: "A game" }))).toBe(
      "generic",
    )
  })
})
