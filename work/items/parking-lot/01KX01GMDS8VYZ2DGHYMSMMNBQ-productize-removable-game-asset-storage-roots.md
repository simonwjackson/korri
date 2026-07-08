---
id: 01KX01GMDS8VYZ2DGHYMSMMNBQ
slug: productize-removable-game-asset-storage-roots
title: Productize removable game-asset storage roots
origin: parked
status: To Do
priority: medium
labels:
  - follow-up
  - game-assets
  - storage
  - removable-media
  - shift
created: 2026-07-08
source: user
---

# Productize removable game-asset storage roots

## Why it matters

Shift media blobs can be redirected with KORRI_GAME_ASSETS_ROOT today, but there is no first-class Nix/module or runtime policy for putting all game-asset state on removable SD storage. Users who want large artwork caches off internal storage need a supported, boot-safe, mount-aware configuration instead of ad hoc environment overrides, symlinks, or manual service edits.

## Acceptance Criteria

- [ ] Add a documented, first-class configuration option for the durable game-asset blob root, suitable for SD-card/removable storage deployments.
- [ ] Clarify or implement the relationship between blob storage, candidate cache storage, and library assignment sidecars so operators know what moves and what remains under KORRI_LIBRARY_ROOT.
- [ ] Ensure daemon startup handles missing/unmounted removable targets safely with clear logs or fallback behavior rather than silently losing media.
- [ ] Add tests or Nix checks covering the configured asset-root environment/wiring and default sibling-of-library behavior.

## Related

- `product/platform/library/game-assets/game-assets-service.ts`
- `product/platform/library/game-assets/candidate-cache.ts`
- `product/systems/nixos/modules/korri-daemon.nix`

## Notes

Discovered after seeding SteamGridDB/Shift media on AKA and Bandai. Durable blobs support KORRI_GAME_ASSETS_ROOT in code; candidates use XDG_CACHE_HOME/korri/game-assets/candidates; assignment metadata remains under KORRI_LIBRARY_ROOT. Productized SD-card support needs an explicit configuration and lifecycle story.
