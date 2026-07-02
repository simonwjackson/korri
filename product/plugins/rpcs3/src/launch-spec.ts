import { isAbsolute } from "node:path"
import type { LaunchSpec } from "@platform/library/launcher"

export interface ComposeRpcs3LaunchSpecOptions {
  readonly command: string
  readonly gameFolderPath: string
  readonly extraArgs?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

export function composeRpcs3LaunchSpec(
  options: ComposeRpcs3LaunchSpecOptions,
): LaunchSpec {
  if (!isAbsolute(options.command)) {
    throw new Error("RPCS3 launches require an absolute command")
  }
  if (options.gameFolderPath.trim().length === 0) {
    throw new Error("RPCS3 launches require a game folder path")
  }

  return {
    command: options.command,
    args: ["--no-gui", ...(options.extraArgs ?? []), options.gameFolderPath],
    ...(options.env !== undefined ? { env: options.env } : {}),
  }
}
