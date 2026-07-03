---
id: 01KWMZ3RP58JT5TGJQ721PD1JA
slug: model-sunshine-as-a-stream-host-plugin-into-the-streaming-co
title: Model Sunshine as a stream-host plugin into the streaming core
origin: parked
status: To Do
priority: medium
labels:
  - architecture
  - streaming
  - plugin-extraction
created: 2026-07-03
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: d7e08b8f
  repo: korri
  invoked_by: se-architecture-improvement
---

# Model Sunshine as a stream-host plugin into the streaming core

## Why it matters

Sunshine is Korri's stream *host/encoder*, but its specifics (the fixed "Korri Stream" app, the runtime-settings encoder capabilities: bitrate/fps/resolution operations, the h264_vaapi seamless path) live as vendored patches plus generic platform stream-control code rather than as a self-contained host plugin. Same split-brain shape we removed for itchio. The streaming *core* should be generic (control-surface contract, adaptation policy, session lifecycle) with Sunshine as one host plugin plugging into it — so a different host/encoder backend becomes an additive plugin rather than a platform edit, and Sunshine's mechanism facts (which operations are supported on which encoder path) are owned in one place.

## Acceptance Criteria

- [ ] Streaming-core plugin seam is defined (shared with the Moonlight item): what a stream-host plugin contributes vs what the generic core owns
- [ ] A @korri:sunshine plugin folder exists under product/plugins/ owning Sunshine host identity (Korri Stream app) and the encoder runtime-settings capability facts (supported bitrate/fps/resolution operations per encoder path)
- [ ] Generic platform stream-control code no longer hard-codes Sunshine host specifics; it consumes them through the core seam
- [ ] The 'mechanisms/facts only, Korri owns adaptation policy' boundary is preserved, including the h264_vaapi-only active-bitrate advertisement
- [ ] Existing runtime-settings behavior (show/bitrate/fps/resolution) is unchanged; targeted stream-control tests pass
- [ ] Vendored sunshine-korri Nix package/patches are untouched

## Related

- `product/platform/stream-control/control-contract.ts`
- `product/platform/stream-control/control-surface.ts`
- `product/platform/stream-control/stream-control-api-routes.ts`
- `product/platform/stream/moonlight-runtime-watch-artifact.ts`
- `product/vendor/sunshine-korri/README.md`
- `product/plugins/AGENTS.md`

## Notes

Prerequisite (shared with the Moonlight item): first define the streaming-core plugin seam — what a "stream host" plugin contributes (host app identity, encoder/runtime-settings capability facts such as which stream-control operations are supported on which encoder path, host-side control-plane) vs what the generic core owns (stream-control contract, adaptation policy, session lifecycle). This seam-definition is the enabling design step and may deserve its own design item; the Moonlight (client) and Sunshine (host) items are the two adapters that plug into it. Preserve the current contract: "Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy" — Sunshine advertises capability (e.g. active-stream bitrate only on the seamless h264_vaapi VAAPI path), the core decides policy. Do NOT relocate the vendored Nix package/patches (product/vendor/sunshine-korri) into the plugin as source; the plugin owns the TS descriptor + host capability facts, the vendored build/patch series stays put. Reference plugin shape: gamescope (src/stream-control, src/runtime-control). Cross-link: 01KVBPNPXZ3X49XSCFXPY6CVW8 and 01KVBNK266WD0D4GX2DSABA9QG. Related runtime-settings hardening context: the stream-control-* and moonlight-runtime-watch surfaces.
