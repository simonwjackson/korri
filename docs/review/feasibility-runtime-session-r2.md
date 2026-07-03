# Feasibility review — runtime session contract R2

- **PASS — source-machine existing user bus propagation.** The plan now matches existing module seams: `korri-compositor` already supports `sessionBus.mode = "existing"` with `DBUS_SESSION_BUS_ADDRESS` in unit env, and `kiosk.nix` provides the sibling-unit copy pattern for sessiond.

- **PASS — x86 PipeWire defaults in source-machine.** The proposed `pkgs.stdenv.hostPlatform.isx86_64` + `mkDefault` approach is compatible with the current source-machine composition and keeps host overrides possible.

- **PASS — portable compatibility boundaries.** The plan preserves SM8550/RK explicit Pulse/PipeWire bridge exceptions and avoids applying x86 source-machine audio defaults to aarch64 platform adapters.

- **FAIL — frontmatter verification command names non-existent check attrs.** `plan.md` asks for `korri-rocknix-sm8550-kiosk-config`, `korri-rocknix-rk3566-kiosk-config`, and `korri-rk3326-kiosk-config`, but `product/systems/nixos/flake/checks.nix` currently exposes `korri-sm8550-kiosk-config` and `korri-rk3566-kiosk-config`, with no RK3326 check. Update the command or make U4 create/wire the RK3326 check before requiring it.
