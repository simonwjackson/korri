# Scope / complexity review: runtime-session plan

## Finding 1 — U3 introduces a one-consumer x86 audio module

**Severity:** P2  
**Confidence:** 75

U3 creates and exports `product/systems/nixos/modules/korri-x86-audio.nix`, adds a dedicated module check, and wires it back into `source-machine.nix` (plan lines 224-231). The stated consumer is still only x86 source-machine: “Import or enable that module from source-machine composition so the behavior comes for free on x86 source machines” (lines 233-236), and the requirement is simply “Make x86 source-machine audio work…” (line 27).

This is a shallow abstraction unless the plan names another current role that will import the module independently. The minimum change set is to put the `mkDefault` PipeWire/PipeWire-Pulse/WirePlumber/RTKit defaults directly in the source-machine composition behind the existing x86 guard, then prove them in the existing source-machine checks. A public flake module plus a standalone check adds module-surface area and override semantics before a second consumer exists.

**Suggested plan edit:**

- Change U3 Files to modify only `product/systems/nixos/images/source-machine.nix` plus existing source-machine checks.
- Remove `korri-x86-audio.nix`, its flake export, and `korri-x86-audio-module-check.nix` unless the plan adds a named second current consumer.
- Keep the host-override test scenario by asserting that source-machine’s `mkDefault` audio settings can be overridden without `mkForce`.
- If a separate module is retained, state the current public contract it owns and which non-source-machine role consumes it now.

## Finding 2 — U4 refactors working portable adapters instead of first asserting the contract

**Severity:** P2  
**Confidence:** 75

The plan says the Nix-on-Rocks adapters “already set `services.korri.compositor.runtimeDir = "%t"`” (line 60) and U4’s first approach bullet is to “Preserve existing `%t` compositor runtime behavior” (line 274). Despite that, U4 modifies three platform adapters, possibly `korri-rocknix-audio-bootstrap.nix`, and maybe adds/updates an RK3326 check (lines 264-271) primarily to “replace duplicate local path formulas with shared runtime-session facts” (line 275).

That is more implementation churn than the goal requires. The user goal is one app-facing runtime-session approach with Korri defaults; for devices that already use `%t`, the right-sized slice is to assert and document the existing behavior, not rewrite path variables across portable platforms while fixing an x86 source-machine regression. Broad portable-device edits also increase risk around the exact exceptions the plan says must be preserved: root/system/browser/cross-user audio bridges (lines 276-277).

**Suggested plan edit:**

- Recast U4 as “assert and document portable-device conformance” rather than a normalization refactor.
- Limit code edits to places where U1/U2 creates an actually consumed shared fact; otherwise leave existing platform-local formulas intact.
- Keep existing SM8550/RK3566 checks and add only contract-aligned assertions that prove `%t` posture and required explicit bridge values remain.
- Move broad duplicate-formula cleanup and RK3326 check expansion to a follow-up after x86 source-machine and Aka validation pass.

## Finding 3 — U1’s shared “runtime-session facts” catalog is broader than the policy it needs to enforce

**Severity:** P3  
**Confidence:** 75

U1 proposes read-only/defaulted facts for “runtime root `%t`, session socket dir `%t/korri`, game-stream runtime `%t/korri-game-stream`, and user-bus address `unix:path=%t/bus`” (lines 154-158). But the plan’s own context notes that `korri-runtime.nix` already defaults Korri-owned sockets to `%t/korri` (line 55), and `korri-game-stream.nix` already owns `%t` expansion for its runtime files (line 58).

A central contract module is useful if it enforces invariants. A catalog of string aliases risks becoming a shallow abstraction that every role/platform has to route through without hiding meaningful complexity. It also appears to drive the larger U4 rewrite: “Downstream role modules can reference one shared path vocabulary instead of local duplicate formulas” (line 172).

**Suggested plan edit:**

- Narrow U1 to the minimum shared contract facts that will be consumed immediately by U2 and checks.
- Prefer invariants over aliases: e.g. source-machine `XDG_RUNTIME_DIR == "%t"`, Korri-owned IPC remains under `%t/korri`, game-stream state remains under `%t/korri-game-stream`, and user-service bus address is `unix:path=%t/bus` where `sessionBus.mode = "existing"`.
- Do not mirror `services.korri.gameStream.runtimeDir` into `services.korri.runtime` unless the plan names multiple current consumers of that value.
- Do not expose `runtime root = "%t"` as a general option/fact if it is only a Linux user-service convention; use it directly in source-machine/default checks.
