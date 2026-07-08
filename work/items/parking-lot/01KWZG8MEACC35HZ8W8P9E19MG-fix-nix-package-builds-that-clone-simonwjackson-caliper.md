---
id: 01KWZG8MEACC35HZ8W8P9E19MG
slug: fix-nix-package-builds-that-clone-simonwjackson-caliper
title: Fix Nix package builds that clone @simonwjackson/caliper
origin: parked
status: To Do
priority: high
labels:
  - nix
  - packaging
  - bandai
created: 2026-07-07
source: se-work
---

# Fix Nix package builds that clone @simonwjackson/caliper

## Why it matters

Bandai packaged deployment cannot rebuild cleanly because Bun tries to git-clone @simonwjackson/caliper inside Nix builds and fails with FileNotFound. Current validation had to use a korrid hotfix drop-in instead of a full packaged switch, which weakens release confidence.

## Acceptance Criteria

- [ ] nixos-rebuild switch --flake .#korri-thor-kiosk builds from a clean worktree without Bun git-clone failures
- [ ] korri-cli, korrid, and korri-inputd package derivations all complete in the Nix sandbox
- [ ] Bandai can be switched to the packaged generation without retaining the temporary /var/lib/korri/hotfix/korrid override

## Related

- `product/services/server/package.nix`
- `product/surfaces/terminal/korri-cli/package.nix`
- `package.json`
- `bun.lock`

## Notes

Observed while trying to deploy stream-control commit 70ffcadc / HEAD 17ae4d55. Failing derivations include korri-cli and korri-inputd with: git clone for @simonwjackson/caliper failed; FileNotFound cloning repository for @simonwjackson/caliper.
