import { describe, expect, it } from "bun:test"
import { resolveLaunchSpec } from "./launch-resolver"
import type { ProfileBackedLaunchTargetRecord } from "./launch-target"
import type { LauncherProfileRecord } from "./launcher-profile"

const profile: LauncherProfileRecord = {
  id: "rocknix.retroarch.snes",
  command: "/usr/bin/runemu.sh",
  args: [
    "{contentPath}",
    "-P{system}",
    "--core={core}",
    "--emulator={emulator}",
  ],
  defaults: {
    system: "snes",
    emulator: "retroarch",
    core: "snes9x",
  },
  policy: { allowedCommands: ["/usr/bin/runemu.sh"] },
}

const target: ProfileBackedLaunchTargetRecord = {
  id: "game-1",
  profile: profile.id,
  contentPath: "/storage/roms/snes/F Zero.smc",
}

describe("resolveLaunchSpec", () => {
  it("resolves profile defaults plus target contentPath into a LaunchSpec", () => {
    const result = resolveLaunchSpec(profile, target)

    expect(result).toEqual({
      _tag: "Resolved",
      spec: {
        command: "/usr/bin/runemu.sh",
        args: [
          "/storage/roms/snes/F Zero.smc",
          "-Psnes",
          "--core=snes9x",
          "--emulator=retroarch",
        ],
      },
    })
  })

  it("lets target fields override profile defaults", () => {
    const result = resolveLaunchSpec(profile, { ...target, core: "mesen-s" })

    expect(result._tag).toBe("Resolved")
    if (result._tag === "Resolved") {
      expect(result.spec.args).toContain("--core=mesen-s")
    }
  })

  it("appends args without whitespace splitting", () => {
    const result = resolveLaunchSpec(profile, {
      ...target,
      argsAppend: ["--set-label=F Zero GX"],
    })

    expect(result._tag).toBe("Resolved")
    if (result._tag === "Resolved") {
      expect(result.spec.args.at(-1)).toBe("--set-label=F Zero GX")
    }
  })

  it("merges env with target values taking precedence", () => {
    const result = resolveLaunchSpec(
      {
        ...profile,
        env: { KORRI_SYSTEM: "{system}", OVERRIDE_ME: "profile" },
      },
      { ...target, env: { OVERRIDE_ME: "target" } },
    )

    expect(result._tag).toBe("Resolved")
    if (result._tag === "Resolved") {
      expect(result.spec.env).toEqual({
        KORRI_SYSTEM: "snes",
        OVERRIDE_ME: "target",
      })
    }
  })

  it("reports a missing required placeholder value", () => {
    const result = resolveLaunchSpec(
      { ...profile, defaults: { system: "snes", emulator: "retroarch" } },
      target,
    )

    expect(result).toEqual({
      _tag: "Failed",
      error: { _tag: "MissingRequiredValue", key: "core" },
    })
  })

  it("reports unsupported placeholders", () => {
    const result = resolveLaunchSpec(
      { ...profile, args: ["{unknown}"] },
      target,
    )

    expect(result).toEqual({
      _tag: "Failed",
      error: { _tag: "UnresolvedPlaceholder", placeholder: "{unknown}" },
    })
  })

  it("rejects disallowed commands", () => {
    const result = resolveLaunchSpec(
      {
        ...profile,
        command: "/bin/echo",
        policy: { allowedCommands: ["/usr/bin/runemu.sh"] },
      },
      target,
    )

    expect(result).toEqual({
      _tag: "Failed",
      error: { _tag: "DisallowedCommand", command: "/bin/echo" },
    })
  })

  it("returns invalid config when the resolved command is empty", () => {
    const result = resolveLaunchSpec(
      { ...profile, command: "{core}" },
      { ...target, core: "" },
    )

    expect(result._tag).toBe("Failed")
    if (result._tag === "Failed") {
      expect(result.error._tag).toBe("MissingRequiredValue")
    }
  })
})
