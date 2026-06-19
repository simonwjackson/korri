# zquest-classic package

Builds the unstable 2026-06-18 ZQuest Classic player for aarch64 kiosk images.

## Outputs

- `bin/zplayer` — standalone Zelda Classic quest player used by the Korri launcher.
- `bin/zlauncher` — upstream launcher binary, exposed for completeness and manual debugging.

## Patch policy

`aarch64-disable-x86-tile-simd.patch` disables x86-specific tile SIMD paths when building on aarch64. Keep architecture-specific patches beside the package so Nix review can audit exactly what differs from upstream.

## Verification

Build the package-level check from the repository root:

```sh
nix build --impure .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).zquest-classic-check --no-link
```

The product-level smoke proof is an on-device `zplayer -standalone <quest.qst> <save.sav>` launch through the `@korri:zquest-classic/zplayer` launcher.
