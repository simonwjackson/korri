---
id: task-027
title: Parameterize kiosk-unit references in substrate (lid cgroup, input ordering, hasKorriKiosk)
status: To Do
priority: high
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - sm8550
  - swing-1-foundation
created: 2026-05-30
source: se-work
---

# Parameterize kiosk-unit references in substrate (lid cgroup, input ordering, `hasKorriKiosk`)

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. **Plan 003's closeout retro classified these as "soft systemd unit refs (no-op when absent)" — that classification was wrong.** Each of these is a real semantic leak that the substrate uses at runtime:

### Leak A: hardcoded cgroup path in `guest/modules/lid.nix:115`

```sh
for candidate in \
  /sys/fs/cgroup/system.slice/korri-kiosk.service \
  /sys/fs/cgroup/system.slice/main-space-sway-kiosk.service; do
```

The lid module finds the kiosk's cgroup to SIGSTOP non-keep PIDs on lid-close. It probes for `korri-kiosk.service` first, falling back to `main-space-sway-kiosk.service`. A non-Korri product's kiosk under a different unit name silently falls back to the substrate-default `main-space-sway-kiosk.service` — but that fallback is itself a substrate-local fallback profile, not a real kiosk. The lid feature breaks for any product that isn't Korri or the substrate-fallback.

### Leak B: option-tree inspection in `guest/modules/input.nix:17`

```nix
hasKorriKiosk = options.services ? korri && options.services.korri ? kiosk;
```

The substrate **reads the downstream product's NixOS option tree** to decide its own behavior. That is the textbook product-knowledge leak. If a future product's option group is named differently (`services.acme.kiosk`), the substrate's input handling silently downgrades.

### Leak C: hardcoded ordering targets in `guest/modules/input.nix:44-45`

```nix
before = [
  "korri-compositor.service"
  "korri-inputd.service"
  ...
];
```

The raw-gamepad-hider service orders itself before three Korri-specific unit names. A non-Korri product needs its compositor and inputd named identically to inherit the ordering, or its raw gamepads aren't hidden before its compositor starts.

## Why it matters

These three together are the substrate's **load-bearing** Korri couplings — runtime behavior depends on them, not just commentary. Until they parameterize:

- Lid-close on a non-Korri product silently SIGSTOPs the wrong cgroup
- Input behavior on a non-Korri product silently downgrades
- Raw-gamepad-hider ordering on a non-Korri product silently misorders

All three failure modes are silent. None throws an eval error or a runtime alert. That makes this the highest-priority Swing-1 item: it's the difference between "product-blind by intention" and "product-blind by enforcement."

## Group

**Swing 1 — Foundation** (with task-028 contract assertion params, task-030 invariants doc). Must land as one PR because:

- Introduces a new substrate option group: `rocknix.session.kioskUnit` (and probably peer options for `compositorUnit`, `inputdUnit`)
- Module changes (this task), contract test updates (task-028), and the written invariant (task-030) are mutually dependent — splitting them leaves the substrate in an unbuildable intermediate state

Blocks Swing 2 partially (Korri-side packages can land independently, but the launchers and modules that consume `korri-kiosk.service` want the parameter).

Blocks Swing 3 fully because launchers depend on which unit name to start.

## Acceptance Criteria

### New substrate option group

- [ ] Add a new option group to `guest/modules/session.nix` (or a dedicated `guest/modules/kiosk-handoff.nix` if it grows past 3 options):
  ```nix
  rocknix.session.kioskUnit = mkOption {
    type = types.str;
    default = "main-space-sway-kiosk.service";
    description = "systemd unit name the downstream product publishes for its kiosk session.";
  };
  rocknix.session.compositorUnit = mkOption { ... };
  rocknix.session.inputdUnit = mkOption { ... };
  ```
  Substrate default keeps the fallback profile working. Korri sets these to `korri-kiosk.service`, `korri-compositor.service`, `korri-inputd.service`.

### Module consumers

- [ ] `guest/modules/lid.nix:115`: replace the hardcoded `korri-kiosk.service` candidate with `config.rocknix.session.kioskUnit`. Keep the fallback to the substrate's own `main-space-sway-kiosk.service` only if it's the substrate default.
- [ ] `guest/modules/input.nix`:
  - Delete `hasKorriKiosk` and the `options.services ? korri` inspection entirely.
  - Replace the hardcoded `before = [ "korri-compositor.service" "korri-inputd.service" "main-space-sway-kiosk.service" "korri-kiosk.service" ]` with `before = [ config.rocknix.session.compositorUnit config.rocknix.session.inputdUnit config.rocknix.session.kioskUnit ]`.
- [ ] `guest/modules/session.nix:77`: replace the hardcoded `"korri-kiosk.service"` with `config.rocknix.session.kioskUnit`.

### Korri side

- [ ] Korri's SM8550 platform composition (likely `nix/images/platforms/rocknix-sm8550.nix` or wherever Korri sets substrate options) sets `rocknix.session.kioskUnit = "korri-kiosk.service"` and peers. Default unchanged for substrate-only consumers.

### Static guard

- [ ] Add a new boundary-lint guard: `grep -nE '"korri-[a-z]+\.service"' guest/modules/ guest/profiles/` returns nothing. Negative assertion that the substrate no longer hardcodes Korri unit names.

### Verification

- [ ] Substrate-only build (no Korri payload) shows `main-space-sway-kiosk.service` ordering everywhere — proof the parameter defaults correctly.
- [ ] Korri-payload build shows `korri-kiosk.service` ordering everywhere — proof Korri's overrides flow.
- [ ] `nix flake check --no-build` green.

## Related

- nix-on-rocks `guest/modules/lid.nix`
- nix-on-rocks `guest/modules/input.nix`
- nix-on-rocks `guest/modules/session.nix`
- nix-on-rocks `scripts/check-boundary-lint` (new guard to add)
- task-028: parameterizes the test contracts using the same option
- task-030: writes the invariant that this task enforces
- Plan 003 closeout retro (the call this task corrects)

## Notes

**Design questions to resolve before promoting:**

1. **Option-group shape.** Three peer options under `rocknix.session.*`, or a single nested attrset `rocknix.session.units = { kiosk, compositor, inputd }`? Both work. Recommendation: peer options, because they're consumed independently and the dot-path is shorter at every call site.

2. **What about `main-space-sway-kiosk.service`?** That's the substrate's own fallback kiosk. It is **not** a leak — the substrate owns that unit. The new option's default points to it. Korri overrides. Question: should the substrate also accept `null` to mean "no kiosk at all" (a headless product)? Recommendation: yes, treat the empty string or null as "skip ordering against any kiosk," because forcing the substrate to always have a kiosk is itself a product-shape leak.

3. **Pair with task-028 in one PR.** Module changes need contract-test updates to land green. Splitting causes a red-CI intermediate state.

Captured from `/se-work` deep migration audit on 2026-05-30.
