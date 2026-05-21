/**
 * Re-export shim. The implementation moved to
 * `@app/stream/moonlight-launcher` so the desktop launch path can
 * share it with the CLI without depending on `tools/cli/*`. Keep this
 * file as a deprecated alias until all in-repo importers migrate.
 */
export * from "@app/stream/moonlight-launcher"
