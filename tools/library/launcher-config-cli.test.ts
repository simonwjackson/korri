import { describe, expect, it } from "bun:test"
import { withTempProseqlLibrary } from "../testing/library/with-temp-proseql-library"
import { validateLauncherConfig } from "./launcher-config-cli"

describe("validateLauncherConfig", () => {
  it("resolves a game id to a LaunchSpec without spawning", async () => {
    await using library = await withTempProseqlLibrary({
      games: [{ id: "game-1", metadata: { name: "Game 1" } }],
      launcherProfiles: [
        {
          id: "echo.profile",
          command: "/bin/echo",
          args: ["{contentPath}"],
        },
      ],
      launchTargets: [
        {
          id: "game-1",
          profile: "echo.profile",
          contentPath: "content with spaces.smc",
        },
      ],
    })

    await expect(
      validateLauncherConfig({ root: library.root, gameId: "game-1" }),
    ).resolves.toEqual({
      status: "resolved",
      gameId: "game-1",
      spec: {
        command: "/bin/echo",
        args: ["content with spaces.smc"],
      },
    })
  })

  it("reports a missing launch target diagnostic", async () => {
    await using library = await withTempProseqlLibrary({
      games: [{ id: "game-1", metadata: { name: "Game 1" } }],
    })

    const result = await validateLauncherConfig({
      root: library.root,
      gameId: "game-1",
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.reason).toBe("MissingLaunchTarget")
    }
  })

  it("reports resolver diagnostics", async () => {
    await using library = await withTempProseqlLibrary({
      games: [{ id: "game-1", metadata: { name: "Game 1" } }],
      launchTargets: [
        {
          id: "game-1",
          profile: "missing.profile",
          contentPath: "content.smc",
        },
      ],
    })

    const result = await validateLauncherConfig({
      root: library.root,
      gameId: "game-1",
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.reason).toBe("LaunchResolutionFailed")
      expect(result.message).toContain("missing.profile")
    }
  })
})
