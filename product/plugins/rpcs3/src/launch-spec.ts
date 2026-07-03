import { isAbsolute } from "node:path"
import { applyArgsOverrides } from "@platform/library/config/apply-overrides"
import type { LaunchOverrides } from "@platform/library/config/records/library-item"
import type { LaunchSpec } from "@platform/library/launcher"

export interface ComposeRpcs3LaunchSpecOptions {
  readonly command: string
  readonly gameFolderPath: string
  /** Routed argv flags from the mapping router (e.g. --fullscreen, --headless). */
  readonly flags?: readonly string[]
  /** Per-launch config file passed via --config. */
  readonly configPath?: string
  /** Optional named input config passed via --input-config. */
  readonly inputConfig?: string
  /** Raw argv escape hatch (overrides.args). */
  readonly overridesArgs?: LaunchOverrides["args"]
  readonly env?: Readonly<Record<string, string>>
}

/**
 * The single argv authority for RPCS3 launches. Order:
 *
 *   command --no-gui <prepend> <routedFlags> --config <path>
 *           [--input-config <name>] <append> <gameFolder>
 *
 * `overrides.args.replace` replaces the routed-flags segment ONLY, never
 * `--no-gui`, `--config`, or the game path. `--fullscreen` is only ever
 * emitted alongside `--no-gui` (RPCS3 honors it only then), which holds
 * because `--no-gui` is always present.
 */
export function composeRpcs3LaunchSpec(
  options: ComposeRpcs3LaunchSpecOptions,
): LaunchSpec {
  if (!isAbsolute(options.command)) {
    throw new Error("RPCS3 launches require an absolute command")
  }
  if (options.gameFolderPath.trim().length === 0) {
    throw new Error("RPCS3 launches require a game folder path")
  }

  const args = applyArgsOverrides({
    leading: ["--no-gui"],
    routed: options.flags ?? [],
    middle: [
      ...(options.configPath !== undefined
        ? ["--config", options.configPath]
        : []),
      ...(options.inputConfig !== undefined
        ? ["--input-config", options.inputConfig]
        : []),
    ],
    trailing: [options.gameFolderPath],
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
