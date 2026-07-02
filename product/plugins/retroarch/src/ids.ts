export const KORRI_RETROARCH_PLUGIN_ID = "@korri:retroarch" as const
// Stable, rebuild-invariant absolute path for the RetroArch binary. Nix exposes
// the binary here (mirroring /etc/korri/cores/*.so and /etc/korri/shaders/slang)
// so the launcher command is a full path with no PATH reliance and no baked
// store hash — required for source-machine stream-prepare (assertAbsoluteLaunchSpec)
// and correct for local kiosk launches alike.
export const KORRI_RETROARCH_BINARY_PATH = "/etc/korri/bin/retroarch" as const
export const KORRI_RETROARCH_APP_LOCAL_ID = "retroarch" as const
export const KORRI_RETROARCH_APP_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_APP_LOCAL_ID}` as const
export const KORRI_RETROARCH_GBA_SYSTEM_ID = "gba" as const
export const KORRI_RETROARCH_MGBA_RUNTIME_LOCAL_ID = "mgba" as const
export const KORRI_RETROARCH_MGBA_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_MGBA_RUNTIME_LOCAL_ID}` as const
