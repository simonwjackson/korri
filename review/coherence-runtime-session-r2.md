# Coherence re-review: runtime-session plan R2

- PASS — Source-machine sessiond D-Bus env is included: U2 copies `DBUS_SESSION_BUS_ADDRESS` into `services.korri.sessiond.extraEnvironment` and asserts compositor/sessiond env parity.
- PASS — SM8550 Pulse env is preserved: scope, deferred work, key decisions, and U4 all keep `PULSE_SERVER=unix:%t/pulse/native` for this slice.
- PASS — No shallow x86-audio module remains: x86 PipeWire defaults live directly in `source-machine.nix` with existing source-machine checks.
- PASS — R2 now explicitly carves out Wayland/Sway root-runtime endpoints and matches the design/test text.
- PASS — RK-family wording is coherent: root/system bridge envs are consistently framed as compatibility exceptions to reach the Korri runtime user's sockets.
- PASS — RK3326 gating is deterministic: touched RK3326 work requires a first-class config check; otherwise RK3326 stays unchanged and follow-up-owned.

No fail findings.
