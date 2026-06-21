// Composes the Chromium argv for a web-game launch.
//
// The base flag set is fixed here, baked in once from the runtime lessons proven
// on-device: run on gamescope's Xwayland (`--ozone-platform=x11`) so the window
// manager can fullscreen the window, app mode for no chrome, `--no-sandbox` only
// (NOT `--disable-gpu-sandbox`, whose unsupported-flag infobar steals vertical
// space and cascades into canvas scrollbars), and `--ignore-gpu-blocklist` for
// GPU acceleration on Adreno/Freedreno. `--test-type` is intentionally never
// added — it is only needed to suppress the infobar we no longer trigger.

export type WebAutoplayPolicy = "no-gesture" | "default"

export interface WebChromiumArgsInput {
  readonly locator: string
  readonly autoplay?: WebAutoplayPolicy
  readonly extraFlags?: readonly string[]
  // x11 = gamescope's Xwayland (xwm can fullscreen it); wayland = bare under the
  // host compositor (no gamescope). Defaults to x11.
  readonly ozonePlatform?: "x11" | "wayland"
  readonly overrides?: {
    readonly prepend?: readonly string[]
    readonly append?: readonly string[]
  }
}

const BASE_FLAGS = [
  "--ozone-platform={ozone}",
  "--app={locator}",
  "--no-sandbox",
  "--ignore-gpu-blocklist",
  "--no-first-run",
  "--no-default-browser-check",
  "--start-fullscreen",
  "--kiosk",
] as const

function autoplayFlag(policy: WebAutoplayPolicy): string {
  return policy === "default"
    ? "--autoplay-policy=user-gesture-required"
    : "--autoplay-policy=no-user-gesture-required"
}

export function composeWebChromiumArgs(input: WebChromiumArgsInput): string[] {
  const ozone = input.ozonePlatform ?? "x11"
  const base = BASE_FLAGS.map(flag =>
    flag.replace("{locator}", input.locator).replace("{ozone}", ozone),
  )
  return [
    ...(input.overrides?.prepend ?? []),
    ...base,
    autoplayFlag(input.autoplay ?? "no-gesture"),
    ...(input.extraFlags ?? []),
    ...(input.overrides?.append ?? []),
  ]
}
