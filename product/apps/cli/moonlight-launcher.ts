/**
 * Re-export shim. The implementation moved to
 * `@product/apps/portal/stream/moonlight-launcher` so the desktop launch path can
 * share it with the CLI without depending on `product/apps/cli/*`. Keep this
 * file as a deprecated alias until all in-repo importers migrate.
 */
export * from "@product/apps/portal/stream/moonlight-launcher"
