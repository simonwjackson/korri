import { describe, expect, it } from "bun:test"
import { Effect } from "effect"

import {
  parseSteamAppId,
  renderSteamLaunchSpec,
  validateSteamLaunchOptions,
} from "./launch-spec"

const defaultWrapper = "/run/current-system/sw/bin/korri-steam-app"

describe("steam launch spec", () => {
  it("parses Steam rungameid targets", () => {
    expect(parseSteamAppId("steam://rungameid/2379780")).toMatchObject({
      _tag: "Right",
      right: "2379780",
    })
  })

  it("renders the managed korri-steam-app wrapper for the parsed appid", async () => {
    const spec = await Effect.runPromise(
      renderSteamLaunchSpec({
        command: "steam",
        target: "steam://rungameid/2379780",
      }),
    )

    expect(spec).toEqual({ command: defaultWrapper, args: ["2379780"] })
  })

  it("preserves an absolute korri-steam-app command path", async () => {
    const command = defaultWrapper
    const spec = await Effect.runPromise(
      renderSteamLaunchSpec({
        command,
        target: "steam://rungameid/2379780",
      }),
    )

    expect(spec).toEqual({ command, args: ["2379780"] })
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
