import { isAbsolute } from "node:path"
import { applyArgsOverrides } from "@platform/library/config/apply-overrides"
import type { LaunchOverrides } from "@platform/library/config/records/library-item"
import type { LaunchSpec } from "@platform/library/launcher"
import type { MelonDsPolicy } from "./policy"

export interface ComposeMelonDsLaunchSpecOptions {
  readonly command: string
  readonly contentPath: string
  readonly policy?: MelonDsPolicy
  readonly overridesArgs?: LaunchOverrides["args"]
  readonly env?: Readonly<Record<string, string>>
}

export function composeMelonDsLaunchSpec(
  options: ComposeMelonDsLaunchSpecOptions,
): LaunchSpec {
  if (!isAbsolute(options.command)) {
    throw new Error("melonDS launches require an absolute command")
  }
  if (options.contentPath.trim().length === 0) {
    throw new Error("melonDS launches require a Nintendo DS ROM path")
  }

  const args = applyArgsOverrides({
    leading: [],
    routed: options.policy?.video?.fullscreen === true ? ["--fullscreen"] : [],
    trailing: [options.contentPath],
    ...(options.overridesArgs !== undefined
      ? { overrides: options.overridesArgs }
      : {}),
  })

  return {
    command: options.command,
    args,
    ...(options.env !== undefined ? { env: options.env } : {}),
  }
}
