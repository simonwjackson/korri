import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { parseEsSystems } from "./es-systems"

const FIXTURES_DIR = join(import.meta.dir, "fixtures")

async function loadFixture(): Promise<string> {
  return readFile(join(FIXTURES_DIR, "es_systems.sample.cfg"), "utf8")
}

describe("parseEsSystems (real ROCKNIX format)", () => {
  it("parses every <system> block from the sample config", async () => {
    const xml = await loadFixture()
    const systems = parseEsSystems(xml)
    expect(systems.map(s => s.name)).toEqual([
      "snes",
      "wii",
      "nodefault",
      "noemulators",
    ])
  })

  it("captures the raw <command> template (placeholders intact)", async () => {
    const xml = await loadFixture()
    const snes = parseEsSystems(xml).find(s => s.name === "snes")
    expect(snes?.commandTemplate).toBe(
      `/usr/bin/runemu.sh %ROM% -P%SYSTEM% --core=%CORE% --emulator=%EMULATOR% --controllers="%CONTROLLERSCONFIG%"`,
    )
  })

  it("resolves the default emulator/core from the explicit default attribute", async () => {
    const xml = await loadFixture()
    const snes = parseEsSystems(xml).find(s => s.name === "snes")
    expect(snes?.defaultEmulator).toBe("retroarch")
    expect(snes?.defaultCore).toBe("snes9x")
  })

  it("resolves a single-emulator system's default", async () => {
    const xml = await loadFixture()
    const wii = parseEsSystems(xml).find(s => s.name === "wii")
    expect(wii?.defaultEmulator).toBe("dolphin-sa")
    expect(wii?.defaultCore).toBe("dolphin-sa")
  })

  it("falls back to the first emulator + first core when no default is marked", async () => {
    const xml = await loadFixture()
    const fallback = parseEsSystems(xml).find(s => s.name === "nodefault")
    expect(fallback?.defaultEmulator).toBe("firstemu")
    expect(fallback?.defaultCore).toBe("firstcore")
  })

  it("leaves defaultEmulator and defaultCore undefined when no <emulators> block exists", async () => {
    const xml = await loadFixture()
    const noEmu = parseEsSystems(xml).find(s => s.name === "noemulators")
    expect(noEmu?.defaultEmulator).toBeUndefined()
    expect(noEmu?.defaultCore).toBeUndefined()
    expect(noEmu?.commandTemplate).toContain("/storage/.local/bin/run-bar.sh")
  })

  it("parses extensions into a lowercased, dot-prefixed array", async () => {
    const xml = await loadFixture()
    const snes = parseEsSystems(xml).find(s => s.name === "snes")
    expect(snes?.extensions).toEqual([
      ".smc",
      ".fig",
      ".sfc",
      ".swc",
      ".zip",
      ".7z",
    ])
  })

  it("captures fullname and path", async () => {
    const xml = await loadFixture()
    const snes = parseEsSystems(xml).find(s => s.name === "snes")
    expect(snes?.fullname).toBe("Super Nintendo")
    expect(snes?.path).toBe("/storage/roms/snes")
  })

  it("returns [] for empty input", () => {
    expect(parseEsSystems("")).toEqual([])
  })

  it("returns [] for malformed XML without throwing", () => {
    expect(() => parseEsSystems("<systemList><system>broken")).not.toThrow()
    expect(parseEsSystems("<systemList><system>broken")).toEqual([])
  })

  it("skips a <system> that lacks required fields (name, path, command)", () => {
    const xml = `
      <systemList>
        <system>
          <name>incomplete</name>
        </system>
        <system>
          <name>full</name>
          <path>/p</path>
          <command>/c %ROM%</command>
        </system>
      </systemList>
    `
    const systems = parseEsSystems(xml)
    expect(systems.map(s => s.name)).toEqual(["full"])
  })
})
