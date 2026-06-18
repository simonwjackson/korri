---
id: 01KVCK072SQGG484TYNS4QRB88
slug: move-fake-08-closure-assertions-behind-plugin-owned-contract
title: Move fake-08 closure assertions behind plugin-owned contracts
origin: parked
status: To Do
priority: medium
labels:
  - plugins
  - nix
  - fake-08
created: 2026-06-18
source: se-work
---

# Move fake-08 closure assertions behind plugin-owned contracts

## Why it matters

The fake-08 runtime now lives in the PICO-8 plugin bundle, but generic image checks still assert the concrete fake08 core name. A plugin-owned or provider-declared closure contract would reduce future generic Nix edits when plugin runtimes change.

## Acceptance Criteria

- [ ] Generic image checks assert discovered plugin closure contracts rather than hardcoded fake08 strings.
- [ ] PICO-8 plugin owns assertions that its RetroArch closure exposes exactly one fake08 core and the stable /etc/korri core path.
- [ ] SM8550 and live USB checks still fail if the enabled PICO-8 plugin runtime drops out of kiosk images.

## Related

- `product/plugins/pico8-bbs/nix/nixos-module.nix`
- `tools/testing/nix/korri-image-outputs-check.nix`
- `tools/testing/nix/korri-live-usb-config-check.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
