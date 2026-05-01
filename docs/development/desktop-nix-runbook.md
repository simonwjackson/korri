# Desktop Nix Runbook

## Electrobun version bumps

1. Update `electrobun` in `package.json` and refresh `bun.lock`.
2. Run `tools/scripts/bump-electrobun.sh <version>`.
3. Paste the printed hashes into `nix/versions.nix`.
4. Temporarily set `bunDepsHash` in `nix/versions.nix` to `sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`.
5. Run `nix build .#bun-deps --no-link` and copy the reported `got:` hash back into `nix/versions.nix`.
6. Verify `nix build .#korri-desktop --no-link`.

The bumper prints the current shell's Bun version so it can be compared with the Bun runtime bundled by Electrobun's core tarball when investigating version drift.

## Missing library debugging

If a patched desktop binary fails with `error while loading shared libraries`, add the missing package to the shared Linux runtime library set in `flake.nix`. The same list feeds:

- `KORRI_NIX_LD_LIBRARY_PATH` for `nix develop` desktop commands.
- `LD_LIBRARY_PATH` / wrapper setup for `nix run`.

Prefer adding the smallest package that provides the missing shared object, then verify both `just desktop-runtime-check` and `nix build .#korri-desktop --no-link`.

## ARM CI

The first `aarch64-linux` CI path uses QEMU emulation. If native ARM runners become available, replace the emulated Stage 2 job runner in `.github/workflows/desktop-stage2.yml` and remove the QEMU setup step.
