import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import {
  parseSteamAppId,
  renderSteamLaunchSpec,
  validateSteamLaunchOptions,
} from "./launch-spec"

describe("steam launch spec", () => {
  it("parses Steam rungameid targets", () => {
    expect(parseSteamAppId("steam://rungameid/2379780")).toMatchObject({
      _tag: "Right",
      right: "2379780",
    })
  })

  it("renders steam -applaunch for the parsed appid", async () => {
    const spec = await Effect.runPromise(
      renderSteamLaunchSpec({
        command: "steam",
        target: "steam://rungameid/2379780",
      }),
    )

    expect(spec).toEqual({ command: "steam", args: ["-applaunch", "2379780"] })
  })

  it("passes literal Steam %command% launch options but rejects Korri tokens", () => {
    expect(validateSteamLaunchOptions("wrapper -- %command%")).toMatchObject({
      _tag: "Right",
      right: "wrapper -- %command%",
    })
    expect(
      validateSteamLaunchOptions("wrapper -- {content.path}"),
    ).toMatchObject({
      _tag: "Left",
      left: expect.objectContaining({ _tag: "InvalidSteamLaunchOptions" }),
    })
  })

  it("fails non-Steam target shapes", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        renderSteamLaunchSpec({
          command: "steam",
          target: "https://store.steampowered.com/app/2379780",
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "InvalidSteamTarget" })
  })
})
