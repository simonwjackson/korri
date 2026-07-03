// TEMPORARY SHIM (U3 -> removed in U5): Moonlight moved to the @korri:moonlight
// plugin. Runtime callers are being flipped to registry dispatch; this re-export
// keeps them green in the meantime. Do not add new imports of this path.
export * from "@product/plugins/moonlight/src/moonlight-control-protocol"
