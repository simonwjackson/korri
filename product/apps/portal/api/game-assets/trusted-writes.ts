export const GAME_ASSETS_TRUSTED_WRITES_ENV = "KORRI_GAME_ASSETS_TRUSTED_WRITES"

export function areGameAssetTrustedWritesEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const value = env[GAME_ASSETS_TRUSTED_WRITES_ENV]?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}
