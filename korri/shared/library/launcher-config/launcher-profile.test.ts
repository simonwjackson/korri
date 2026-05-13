import { describe, expect, it } from "bun:test"

import { decodeLauncherProfileRecord } from "./launcher-profile"

describe("LauncherProfileRecord", () => {
  it("decodes a valid launcher profile", () => {
    const profile = decodeLauncherProfileRecord({
      id: "rocknix.retroarch.snes",
      command: "/usr/bin/runemu.sh",
      args: ["{contentPath}", "-P{system}"],
      defaults: {
        system: "snes",
        emulator: "retroarch",
        core: "snes9x",
      },
    })

    expect(profile.id).toBe("rocknix.retroarch.snes")
    expect(profile.args).toEqual(["{contentPath}", "-P{system}"])
  })

  it("rejects an empty command", () => {
    expect(() =>
      decodeLauncherProfileRecord({
        id: "broken",
        command: "",
        args: [],
      }),
    ).toThrow()
  })
})
