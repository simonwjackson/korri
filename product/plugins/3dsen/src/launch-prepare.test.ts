import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareThreeDSenLaunch } from "./launch-prepare"

describe("3dSen launch.prepare", () => {
  it("validates profiles in check mode without writing rom.json", async () => {
    const root = await mktemp()
    const rom = join(root, "Super Mario Bros.nes")
    const registryPath = join(root, "unity", "rom.json")
    await writeFile(rom, "rom")

    await expect(
      prepareThreeDSenLaunch({
        spec: { command: "3dSen.exe", args: ["-id=37"] },
        mode: "check",
        policy: {
          registryPath,
          selectedProfileId: "37",
          profiles: [{ id: "37", title: "Super Mario Bros.", romPath: rom }],
        },
      }),
    ).resolves.toEqual({ spec: { command: "3dSen.exe", args: ["-id=37"] } })
    await expect(readFile(registryPath, "utf8")).rejects.toThrow()
  })

  it("writes all configured profiles in commit mode", async () => {
    const root = await mktemp()
    const smb = join(root, "smb.nes")
    const zelda = join(root, "zelda.nes")
    const registryPath = join(root, "unity", "rom.json")
    await writeFile(smb, "rom")
    await writeFile(zelda, "rom")

    await prepareThreeDSenLaunch({
      spec: { command: "3dSen.exe", args: ["-id=37"] },
      mode: "commit",
      policy: {
        registryPath,
        selectedProfileId: "37",
        profiles: [
          { id: "37", title: "Super Mario Bros.", romPath: smb },
          { id: "12", title: "The Legend of Zelda", romPath: zelda },
        ],
      },
    })

    expect(JSON.parse(await readFile(registryPath, "utf8"))).toMatchObject({
      Items: [
        { id: "37", title: "Super Mario Bros.", romPath: smb },
        { id: "12", title: "The Legend of Zelda", romPath: zelda },
      ],
    })
  })

  it("fails before spawn when the selected profile or ROM path is missing", async () => {
    await expect(
      prepareThreeDSenLaunch({
        spec: { command: "3dSen.exe", args: ["-id=37"] },
        mode: "commit",
        policy: {
          registryPath: "/unused/rom.json",
          selectedProfileId: "37",
          profiles: [{ id: "12", title: "Zelda", romPath: "/missing.nes" }],
        },
      }),
    ).rejects.toThrow("3dSen profile 37 is not configured")
  })
})

async function mktemp(): Promise<string> {
  return await import("node:fs/promises").then(fs =>
    fs.mkdtemp(join(tmpdir(), "korri-3dsen-prepare-")),
  )
}
