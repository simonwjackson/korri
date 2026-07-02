export const KORRI_RPCS3_PLUGIN_ID = "@korri:rpcs3" as const

export const KORRI_RPCS3_APP_LOCAL_ID = "rpcs3" as const
export const KORRI_RPCS3_APP_ID =
  `${KORRI_RPCS3_PLUGIN_ID}/${KORRI_RPCS3_APP_LOCAL_ID}` as const

export const KORRI_RPCS3_RUNTIME_LOCAL_ID = "rpcs3" as const
export const KORRI_RPCS3_RUNTIME_ID =
  `${KORRI_RPCS3_PLUGIN_ID}/${KORRI_RPCS3_RUNTIME_LOCAL_ID}` as const

export const KORRI_RPCS3_PS3_SYSTEM_ID = "ps3" as const

export const KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID = "ps3-games" as const
export const KORRI_RPCS3_GAMES_STORAGE_ID =
  `${KORRI_RPCS3_PLUGIN_ID}/${KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID}` as const

export const KORRI_RPCS3_STATE_STORAGE_LOCAL_ID = "state" as const
export const KORRI_RPCS3_STATE_STORAGE_ID =
  `${KORRI_RPCS3_PLUGIN_ID}/${KORRI_RPCS3_STATE_STORAGE_LOCAL_ID}` as const

export const KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID =
  `${KORRI_RPCS3_PLUGIN_ID}/ps3-disc-folders` as const

export const KORRI_RPCS3_DEFAULT_GAMES_ROOT =
  "/srv/lakes/towada/gaming/games/sony-playstation-3" as const
export const KORRI_RPCS3_DEFAULT_STATE_ROOT = "/var/lib/korri/rpcs3" as const
export const KORRI_RPCS3_DEFAULT_COMMAND =
  "/run/current-system/sw/bin/rpcs3" as const
