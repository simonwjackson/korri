export interface GmloaderConfigInput {
  readonly apkDirectory?: string
  readonly mainApk?: string
  readonly forcePlatform?: string
  readonly showCursor?: boolean
  readonly useJoystickAsDpad?: boolean
}

export function createGmloaderJson(input: GmloaderConfigInput = {}): string {
  return `${JSON.stringify(
    {
      apk_directory: input.apkDirectory ?? ".",
      main_apk: input.mainApk ?? "assets/game.droid",
      force_platform: input.forcePlatform ?? "os_linux",
      show_cursor: input.showCursor ?? false,
      use_joystick_as_dpad: input.useJoystickAsDpad ?? false,
      startscript: "",
    },
    null,
    2,
  )}\n`
}
