import type { LaunchSpec } from "@platform/library/launcher"
import { Data, Effect } from "effect"

export class InvalidSteamTarget extends Data.TaggedError("InvalidSteamTarget")<{
  readonly target: string
}> {}

export class InvalidSteamLaunchOptions extends Data.TaggedError(
  "InvalidSteamLaunchOptions",
)<{
  readonly value: string
  readonly token: string
}> {}

const STEAM_TARGET_PATTERN = /^steam:\/\/rungameid\/(\d+)$/
const KORRI_TOKEN_PATTERN = /\{[^}]+\}/

export type SteamEither<E, A> =
  | { readonly _tag: "Left"; readonly left: E }
  | { readonly _tag: "Right"; readonly right: A }

export const parseSteamAppId = (
  target: string,
): SteamEither<InvalidSteamTarget, string> => {
  const match = STEAM_TARGET_PATTERN.exec(target)
  return match?.[1]
    ? { _tag: "Right", right: match[1] }
    : { _tag: "Left", left: new InvalidSteamTarget({ target }) }
}

export const validateSteamLaunchOptions = (
  value: string,
): SteamEither<InvalidSteamLaunchOptions, string> => {
  const token = KORRI_TOKEN_PATTERN.exec(value)?.[0]
  return token === undefined
    ? { _tag: "Right", right: value }
    : { _tag: "Left", left: new InvalidSteamLaunchOptions({ value, token }) }
}

export interface RenderSteamLaunchSpecOptions {
  readonly command?: string
  readonly target: string
}

export const renderSteamLaunchSpec = (
  options: RenderSteamLaunchSpecOptions,
): Effect.Effect<LaunchSpec, InvalidSteamTarget> =>
  Effect.gen(function* () {
    const parsed = parseSteamAppId(options.target)
    if (parsed._tag === "Left") return yield* Effect.fail(parsed.left)
    const appId = parsed.right
    return {
      command: options.command ?? "steam",
      args: ["-applaunch", appId],
    }
  })
