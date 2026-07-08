export const KORRI_MELONDS_PLUGIN_ID = "@korri:melonds" as const

export const KORRI_MELONDS_APP_LOCAL_ID = "melonds" as const
export const KORRI_MELONDS_APP_ID =
  `${KORRI_MELONDS_PLUGIN_ID}/${KORRI_MELONDS_APP_LOCAL_ID}` as const

export const KORRI_MELONDS_NDS_SYSTEM_ID = "nds" as const

export const KORRI_MELONDS_STATE_STORAGE_LOCAL_ID = "state" as const
export const KORRI_MELONDS_STATE_STORAGE_ID =
  `${KORRI_MELONDS_PLUGIN_ID}/${KORRI_MELONDS_STATE_STORAGE_LOCAL_ID}` as const

export const KORRI_MELONDS_NDS_DISCOVERY_PROVIDER_ID =
  `${KORRI_MELONDS_PLUGIN_ID}/nds-files` as const

export const KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID = "melonds-package" as const
export const KORRI_MELONDS_PACKAGE_MODULE_ID =
  `${KORRI_MELONDS_PLUGIN_ID}/${KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID}` as const

export const KORRI_MELONDS_DEFAULT_STATE_ROOT =
  "/var/lib/korri/melonDS" as const
export const KORRI_MELONDS_DEFAULT_COMMAND =
  "/run/current-system/sw/bin/melonDS" as const
export const KORRI_MELONDS_PRESENTER_COMMAND =
  "/run/current-system/sw/bin/korri-melonds-presenter" as const
export const KORRI_MELONDS_NIX_PACKAGE = "melonDS" as const
export const KORRI_MELONDS_PRESENTER_NIX_PACKAGE =
  "korri-melonds-presenter" as const
