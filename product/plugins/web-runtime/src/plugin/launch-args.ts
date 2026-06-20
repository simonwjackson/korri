// Composes korri-web-runtime CLI args from a launcher's resolved web settings.
//
// Placeholder substitution in launcher.args is a fixed vocabulary and cannot
// carry per-game settings, so engine plugins / combo launchers append these via
// their launch.compose handler. This is the inverse of parseRunConfig and keeps
// the CLI surface in one tested place.

export interface WebLaunchArgsInput {
  readonly engine?: string
  readonly nativeResolution?: { readonly width: number; readonly height: number }
  readonly filter?: "pixel" | "linear"
  readonly extraFlags?: readonly string[]
  readonly shims?: readonly string[]
  readonly noGamescope?: boolean
}

export function webLaunchArgs(input: WebLaunchArgsInput): string[] {
  const args: string[] = []
  if (input.engine) args.push("--engine", input.engine)
  if (input.nativeResolution) {
    args.push(
      "--native",
      `${input.nativeResolution.width}x${input.nativeResolution.height}`,
    )
  }
  if (input.filter) args.push("--filter", input.filter)
  for (const flag of input.extraFlags ?? []) args.push("--flag", flag)
  for (const shim of input.shims ?? []) args.push("--shim", shim)
  if (input.noGamescope) args.push("--no-gamescope")
  return args
}
