# steam-korri

Korri-owned vendoring of the guest-native ARM64 Steam helper package that was
previously shipped by the `nix-on-rocks` substrate.

The Nix derivation owns immutable helper scripts and the FHS capsule only. Valve
client/runtime payloads remain mutable runtime state seeded outside the Nix
store. The SM8550 image supplies the Korri state layout and launch policy
through `services.korri.steam.*`.

## Provenance

- Vendored from: `github:simonwjackson/nix-on-rocks`
- Source path: `packages/steam/`
- Initial source rev recorded in `manifest.nix` as `korriVendoredFrom.rev`
- ROCKNIX upstream resource provenance remains in `manifest.rocknixSource`

## Runtime contract

- Steam home defaults are supplied by the Korri module, not this package.
- Mutable state belongs under `/var/lib/korri` and `/home/korri`; `/storage`
  paths are intentionally not part of the Korri-owned adapter.
- The product launcher is `korri-steam-guest`; package-internal helper names
  (`steam-arm64-seed`, `steam-guest-run`, etc.) are preserved for reviewable
  upstream parity.
- `steam-guest-run` provides the package-owned FHS Steam execution capsule for
  the mutable ARM64 client payload.
- `steam-guest-runtime-prep` performs package-owned Steam Runtime / pressure-vessel repair
  for mutable Valve runtime trees before launch.
- x86/FEX helper wrapping is an implementation detail for Valve runtime
  compatibility, not a product compatibility surface.
