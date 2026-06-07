import { describe, expect, it } from "bun:test"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { Exit, Option } from "effect"
import { LaunchState, releaseChoiceForLaunch } from "./launch-state"

const singleRelease: PlayableLibraryEntry = {
  id: "downwell",
  itemId: "downwell",
  title: "Downwell",
  launchable: true,
  releases: [{ id: "windows", system: "windows", launchable: true }],
}

const multiRelease: PlayableLibraryEntry = {
  id: "sonic-the-hedgehog",
  itemId: "sonic-the-hedgehog",
  title: "Sonic the Hedgehog",
  launchable: true,
  releases: [
    { id: "genesis", system: "genesis", launchable: true },
    { id: "windows-known", system: "windows", launchable: false },
    { id: "steam", system: "windows", launchable: true },
  ],
}

const knownOnly: PlayableLibraryEntry = {
  id: "windows-known",
  itemId: "windows-known",
  title: "Known Only",
  launchable: false,
  releases: [{ id: "metadata", system: "windows", launchable: false }],
}

describe("LaunchState", () => {
  it("maps successful launch exits to Launched", () => {
    expect(
      LaunchState.fromExit(
        "crystalline-drift",
        Exit.succeed({ status: "launched" }),
      ),
    ).toEqual({ _tag: "Launched", gameId: "crystalline-drift" })
  })

  it("maps failed launch data to Failed", () => {
    expect(
      LaunchState.fromExit(
        "crystalline-drift",
        Exit.succeed({ status: "failed", exitCode: 7 }),
      ),
    ).toEqual({ _tag: "Failed", gameId: "crystalline-drift", exitCode: 7 })
  })

  it("preserves stderr tail for failed launch data", () => {
    expect(
      LaunchState.fromExit(
        "crystalline-drift",
        Exit.succeed({
          status: "failed",
          exitCode: 7,
          stderrTail: "boom",
        }),
      ),
    ).toEqual({
      _tag: "Failed",
      gameId: "crystalline-drift",
      exitCode: 7,
      stderrTail: "boom",
    })
  })

  it("maps failed exits to Defect", () => {
    expect(LaunchState.fromExit("crystalline-drift", Exit.die("boom"))).toEqual(
      { _tag: "Defect", gameId: "crystalline-drift", defect: "boom" },
    )
  })

  it("selects a launch case as an Option", () => {
    const state = LaunchState.launching("crystalline-drift")

    expect(Option.isSome(LaunchState.select("Launching")(state))).toBe(true)
    expect(Option.isNone(LaunchState.select("Failed")(state))).toBe(true)
  })
})

describe("releaseChoiceForLaunch", () => {
  it("selects the only launchable release implicitly", () => {
    expect(releaseChoiceForLaunch(singleRelease)).toEqual({
      _tag: "Launchable",
      releaseId: "windows",
    })
  })

  it("requires a release when multiple releases are launchable", () => {
    expect(releaseChoiceForLaunch(multiRelease)).toEqual({
      _tag: "ReleaseRequired",
      releaseIds: ["genesis", "steam"],
    })
  })

  it("accepts an explicit selected launchable release", () => {
    expect(releaseChoiceForLaunch(multiRelease, "steam")).toEqual({
      _tag: "Launchable",
      releaseId: "steam",
    })
  })

  it("rejects known-only releases", () => {
    expect(releaseChoiceForLaunch(multiRelease, "windows-known")).toEqual({
      _tag: "NotLaunchable",
      releaseId: "windows-known",
    })
    expect(releaseChoiceForLaunch(knownOnly)).toEqual({
      _tag: "NoLaunchableRelease",
    })
  })
})
