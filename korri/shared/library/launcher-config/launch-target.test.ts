import { describe, expect, it } from "bun:test"
import { Schema } from "effect"

import {
  isLegacyLaunchTarget,
  isProfileBackedLaunchTarget,
  LaunchTargetRecord,
} from "./launch-target"

const decodeLaunchTargetRecord = Schema.decodeUnknownSync(LaunchTargetRecord)

describe("LaunchTargetRecord", () => {
  it("decodes a profile-backed launch target keyed by game id", () => {
    const target = decodeLaunchTargetRecord({
      id: "25afeac6-f68c-4d44-b42e-87ec4c0a436b",
      profile: "rocknix.retroarch.snes",
      contentPath: "/storage/roms/snes/f-zero.smc",
    })

    expect(isProfileBackedLaunchTarget(target)).toBe(true)
    expect(target.id).toBe("25afeac6-f68c-4d44-b42e-87ec4c0a436b")
    if (isProfileBackedLaunchTarget(target)) {
      expect(target.contentPath).toBe("/storage/roms/snes/f-zero.smc")
    }
  })

  it("decodes legacy resolved launch targets so they can fail at resolution time", () => {
    const target = decodeLaunchTargetRecord({
      id: "launch:old-game",
      gameId: "old-game",
      spec: { command: "/bin/echo", args: ["old"] },
    })

    expect(isLegacyLaunchTarget(target)).toBe(true)
  })

  it("rejects a non-string contentPath", () => {
    expect(() =>
      decodeLaunchTargetRecord({
        id: "game-1",
        profile: "rocknix.retroarch.snes",
        contentPath: 123,
      }),
    ).toThrow()
  })

  it("rejects argsAppend as a shell-like string", () => {
    expect(() =>
      decodeLaunchTargetRecord({
        id: "game-1",
        profile: "rocknix.retroarch.snes",
        contentPath: "/storage/roms/snes/f-zero.smc",
        argsAppend: "--verbose",
      }),
    ).toThrow()
  })
})
