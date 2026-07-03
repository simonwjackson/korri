---
id: 01KWMZ3RP3KJ9PT9PB2AN84M6W
slug: model-moonlight-as-a-stream-client-plugin-into-the-streaming
title: Model Moonlight as a stream-client plugin into the streaming core
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

# Model Moonlight as a stream-client plugin into the streaming core

## Why it matters

Moonlight is Korri's stream *receiver*, but its specifics are hard-wired straight into generic platform code (product/platform/stream/moonlight-*: control client/protocol, launch spec, MoonlightPolicy argv/env rendering) and product/apps/portal/stream/moonlight-launcher.ts. That is the same split-brain shape we just removed for itchio: to understand or swap the streaming client you bounce across platform + vendor + portal. Conceptually the streaming *core* (session lifecycle, discovery, control surface, adaptation policy) should be generic, and Moonlight should be one client plugin that plugs into it — so a second client (or a future transport) becomes an additive plugin, not a platform rewrite. The vendor README already states the right principle ("Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy") — this item makes the code match that stance.

## Acceptance Criteria

- [ ] Streaming-core plugin seam is defined: a documented contract for what a stream-client plugin contributes vs what the generic streaming core owns
- [ ] A @korri:moonlight plugin folder exists under product/plugins/ owning the Moonlight-specific launch-spec/argv/env (MoonlightPolicy) and local-control command protocol
- [ ] Generic platform code (product/platform/stream/*) and product/apps/portal/stream/moonlight-launcher.ts no longer name Moonlight-specific argv/protocol details directly; they consume the plugin through the core seam
- [ ] The 'mechanisms/facts only, Korri owns adaptation policy' boundary is preserved
- [ ] Existing streaming behavior (launch, local-control, LAN discovery, runtime touch-bounds) is unchanged; targeted stream tests pass
- [ ] Vendored moonlight-embedded-korri Nix package/patches are untouched

## Related

- `product/platform/stream/moonlight-control-client.ts`
- `product/platform/stream/moonlight-control-protocol.ts`
- `product/platform/stream/moonlight-launch-spec.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `product/platform/stream-control/control-contract.ts`
- `product/vendor/moonlight-embedded-korri/README.md`
- `product/plugins/AGENTS.md`

## Notes

Prerequisite (shared with the Sunshine item): first define the streaming-core plugin seam — what a "stream client/transport" plugin contributes (launch-spec/argv rendering, local-control command protocol, LAN discovery participation, control-surface capabilities) vs what the generic core owns (foreground-session lifecycle, adaptation policy, stream-control contract). This seam-definition is the hard/enabling part and may deserve promotion to its own design item. Keep the existing "mechanisms/facts only, Korri owns policy" split. Do NOT move the vendored Nix package/patches (product/vendor/moonlight-embedded-korri) into the plugin as source; the plugin owns the TS descriptor + policy/protocol knowledge, the vendored build artifact stays where it is (like other plugins referencing platform/host capabilities). Reference plugin shape: gamescope (launch companion with src/launch-companion, src/runtime-control, src/stream-control). Cross-link: 01KVBPNPXZ3X49XSCFXPY6CVW8 (generic authored coordination for multi-plugin stream controls) and 01KVBNK266WD0D4GX2DSABA9QG (generic plugin composition diagnostics) already push toward plugin-shaped streaming.
