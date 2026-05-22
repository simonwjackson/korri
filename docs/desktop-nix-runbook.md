# Desktop Nix Runbook

## Electrobun version bumps

1. Update `electrobun` in `package.json` and refresh `bun.lock` (`bun install`).
2. Run `tools/scripts/bump-electrobun.sh <version>` to fetch the new cli + core release tarballs and print their SRI hashes.
3. Paste the printed `electrobun.cli.*` and `electrobun.core.*` hashes into `nix/versions.nix`.
4. Run `just refresh-bun-deps` to regenerate `nix/bun.nix` from the updated `bun.lock`. Commit `nix/bun.nix` alongside `package.json` and `bun.lock`.
5. Verify `nix build .#korri-desktop --no-link`.

`nix/bun.nix` is the lockfile-derived dependency manifest consumed by the bun2nix Nix integration. Each entry is a `fetchurl` whose SRI hash comes directly from `bun.lock`, so there is no separate per-architecture FOD hash to maintain. The same file is consumed by every bun-using Korri derivation (portal, inputd, game-stream, cli, server, desktop).

The `bun2nix` CLI itself is shipped in the dev shell (pinned via the `bun2nix` flake input), so `just refresh-bun-deps` invokes a Nix-pinned binary rather than an unpinned npm fetch. `just check-bun-deps` (run as part of `just check`) verifies the manifest is in sync with `bun.lock` and fails at lint time if it is not.

The `@proseql/core` codec patch is keyed on the exact version string `@proseql/core@0.13.2` in `flake.nix`. When the proseql version bumps in `bun.lock`, the override key must be updated to match — evaluation fails loudly with a pointer to this fact if the key drifts.

The bumper prints the current shell's Bun version so it can be compared with the Bun runtime bundled by Electrobun's core tarball when investigating version drift.

## Missing library debugging

If a patched desktop binary fails with `error while loading shared libraries`, add the missing package to the shared Linux runtime library set in `flake.nix`. The same list feeds:

- `KORRI_NIX_LD_LIBRARY_PATH` for `nix develop` desktop commands.
- `LD_LIBRARY_PATH` / wrapper setup for `nix run`.

Prefer adding the smallest package that provides the missing shared object, then verify both `just desktop-runtime-check` and `nix build .#korri-desktop --no-link`.

## proseql codec patch

The `bunDeps` derivation in `flake.nix` rewrites three `@proseql/core` codec files (hjson, json5, jsonc) from default to namespace imports so Bun's bundler accepts them in the desktop Electrobun bundle. `korri-cli` and `korri-server` also apply the same `sed` loop in their `buildPhase` as defense-in-depth; `korri-desktop` relies solely on the central override. The override key includes an exact version (`@proseql/core@0.13.2`) and an assertion in `flake.nix` fails evaluation if a `bun.lock` bump moves proseql past that version without a matching override update.

## ARM CI

The first `aarch64-linux` CI path uses QEMU emulation. If native ARM runners become available, replace the emulated Stage 2 job runner in `.github/workflows/desktop-stage2.yml` and remove the QEMU setup step.
