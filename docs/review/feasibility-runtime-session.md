# Feasibility review: runtime session contract

## Finding 1 — Source-machine sessiond children still lack the existing-bus address

**Severity:** High implementability risk

U2 switches only `services.korri.compositor.sessionBus` to `existing`. In the current code, that only adds `DBUS_SESSION_BUS_ADDRESS` to the compositor unit environment (`product/systems/nixos/modules/korri-compositor.nix`). Source-machine `services.korri.sessiond.extraEnvironment` currently carries `XDG_RUNTIME_DIR`, Wayland, Sway, and display variables, but not `DBUS_SESSION_BUS_ADDRESS` (`product/systems/nixos/images/source-machine.nix`). Sunshine inherits compositor env, but foreground games inherit sessiond env.

The kiosk composition already documents this exact sibling-unit issue and copies the compositor bus address into sessiond because sessiond-spawned children no longer inherit Sway's process env (`product/systems/nixos/images/kiosk.nix`). Source-machine needs the same treatment if the new contract is “existing user bus at `%t/bus`”.

**Suggested plan edit:** In U2, add an explicit step:

- When `services.korri.compositor.sessionBus.mode == "existing"`, set `services.korri.sessiond.extraEnvironment.DBUS_SESSION_BUS_ADDRESS = services.korri.compositor.sessionBus.address` for source-machine.
- Add source-machine module/image checks asserting `sessiondEnv.DBUS_SESSION_BUS_ADDRESS == "unix:path=%t/bus"`.
- Add live validation from a sessiond-launched foreground process: `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<uid>/bus` and `busctl --user` (or equivalent) succeeds.
- If portal-activated user services are in scope for source-machine, either add a source-machine equivalent of `korri-kiosk-session-environment` or explicitly defer user-manager environment seeding.

## Finding 2 — SM8550 user-service `PULSE_SERVER` is an existing compatibility boundary, not optional cleanup

**Severity:** Medium/high implementation ambiguity

U4 says to preserve explicit audio paths for browser envs, shell runners, system-scope bootstrap services, and root/cross-user boundaries, but it does not name the existing SM8550 user-service `PULSE_SERVER=unix:%t/pulse/native` posture. The current adapter sets that value on the user PipeWire, pipewire-pulse, WirePlumber, inputd, and sessiond environments, and the SM8550 config check asserts those values. Comments in the adapter tie inputd volume shortcuts to that Pulse server.

An implementer following “avoid default `PULSE_SERVER` in user-service paths” could remove values that the current ROCKNIX checks and platform behavior still require.

**Suggested plan edit:** In U4, explicitly list SM8550's `unix:%t/pulse/native` user-service env as a preserved ROCKNIX compatibility exception until separately validated. Update the test scenarios to say SM8550 keeps those env vars, while x86 source-machine must not gain default `PULSE_SERVER` / `PIPEWIRE_RUNTIME_DIR`.

## Finding 3 — RK3326 is in scope but has no regression gate

**Severity:** Medium verification gap

U4 includes `product/systems/nixos/images/platforms/rocknix-rk3326.nix`, but the plan's `verify_command` only builds SM8550, RK3566, and source-machine checks. There is no existing `tools/testing/nix/*rk3326*check*.nix` in this worktree.

That means the plan asks implementers to touch RK3326 runtime/audio exceptions without a Nix eval check proving the preserved `%t`/Pulse/root-substrate posture.

**Suggested plan edit:** Either remove RK3326 from U4's implementation scope for this slice, or add a concrete RK3326/R36T Max config check and include it in `verify_command`. At minimum, assert compositor `runtimeDir == "%t"`, existing bus address, disabled user PipeWire services/sockets, and preserved `PULSE_SERVER=unix:/run/user/<runtime.uid>/pulse/native` sessiond/inputd env.
