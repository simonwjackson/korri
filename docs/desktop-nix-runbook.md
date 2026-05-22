# Desktop Nix Runbook

## Electrobun version bumps

1. Update `electrobun` in `package.json` and refresh `bun.lock` (`bun install`).
2. Run `tools/scripts/bump-electrobun.sh <version>` to fetch the new cli + core release tarballs and print their SRI hashes.
3. Paste the printed `electrobun.cli.*` and `electrobun.core.*` hashes into `nix/versions.nix`.
4. Run `just refresh-bun-deps` to regenerate `nix/bun.nix` from the updated `bun.lock`. Commit `nix/bun.nix` alongside `package.json` and `bun.lock`.
5. Verify `nix build .#korri-desktop --no-link`.

`nix/bun.nix` is the lockfile-derived dependency manifest consumed by the bun2nix Nix integration. Each entry is a `fetchurl` whose SRI hash comes directly from `bun.lock`, so there is no separate per-architecture FOD hash to maintain. The same file is consumed by every bun-using Korri derivation (portal, inputd, game-stream, cli, server, desktop).

The bumper prints the current shell's Bun version so it can be compared with the Bun runtime bundled by Electrobun's core tarball when investigating version drift.

## Missing library debugging

If a patched desktop binary fails with `error while loading shared libraries`, add the missing package to the shared Linux runtime library set in `flake.nix`. The same list feeds:

- `KORRI_NIX_LD_LIBRARY_PATH` for `nix develop` desktop commands.
- `LD_LIBRARY_PATH` / wrapper setup for `nix run`.

Prefer adding the smallest package that provides the missing shared object, then verify both `just desktop-runtime-check` and `nix build .#korri-desktop --no-link`.

## ARM CI

The first `aarch64-linux` CI path uses QEMU emulation. If native ARM runners become available, replace the emulated Stage 2 job runner in `.github/workflows/desktop-stage2.yml` and remove the QEMU setup step.
