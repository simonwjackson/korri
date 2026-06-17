# Gamescope plugin

First-party Korri plugin for Gamescope launch wrapping, runtime control, stream-control actions, session cleanup helpers, and bundled build artifacts.

- `src/` contains TypeScript plugin implementation.
- `packages/` contains first-class Nix/build artifacts bundled with the plugin.
- `flake.nix` exposes self-contained bundled packages for standalone evaluation.
