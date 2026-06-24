export interface GmloaderConfigInput {
  readonly apkDirectory?: string
  readonly apkPath?: string
  readonly mainApk?: string
  readonly forcePlatform?: string
  readonly showCursor?: boolean
  readonly useJoystickAsDpad?: boolean
}

export function createGmloaderJson(input: GmloaderConfigInput = {}): string {
  const apkPath = input.apkPath ?? "game.apk"
  return `${JSON.stringify(
    {
      apk_directory: input.apkDirectory ?? ".",
      apk_path: apkPath,
      // Keep the extracted asset path for compatibility with Korri metadata and
      // older tooling, but gmloader-next itself reads apk_path.
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
