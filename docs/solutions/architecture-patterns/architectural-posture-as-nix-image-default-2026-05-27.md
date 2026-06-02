---
title: Architectural posture belongs in the image-level default, not the module-level default
date: 2026-05-27
category: architecture-patterns
module: nix/images + nix/modules
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "A capability has flipped from opt-in to always-on as part of a zero-backwards-compat change"
  - "The same NixOS module is consumed by multiple image variants with different postures"
  - "A module default that made sense for a single-machine deploy now blocks a fleet-level capability"
  - "An out-of-band host (e.g. mountainous) silently fixed the defaults and the image-built devices did not"
tags: [nix, nixos, defaults, federation, mkdefault, image-composition, korri]
---

# Architectural posture belongs in the image-level default, not the module-level default

## Context

Federation v1 made every library-bearing korri-server LAN-visible by
default — the `KORRI_SERVER_ADVERTISE_ENABLED` knob and the
`services.korri.server.advertise.enable` Nix option were deleted
outright (R14 / zero-backwards-compat). Conceptually, "every server
federates" was settled.

In practice it was not, because the NixOS module's defaults were still
calibrated for the *original* posture of "korri-server is a localhost
control plane":

```nix
# nix/modules/korri-server.nix — module defaults
host = lib.mkDefault "127.0.0.1";
openFirewall = lib.mkDefault false;
```

AKA was federation-visible only because an out-of-band mountainous
config overrode those defaults years ago. Sobo, freshly deployed off
the kiosk image, came up bound to `127.0.0.1`, with no avahi-daemon
and a closed firewall, and silently failed to participate in the
federation that had been declared the default. The bug was not in
federation code; it was in *whose* defaults defined the posture.

## Guidance

When a capability flips from opt-in to always-on, push the new posture
down to the **lowest layer that universally implies it**, not into
every consumer.

In Nix-image composition that layer is the **image base** (the file
every image variant imports), not the **module** (which intentionally
has to work for unusual single-machine consumers too).

Concretely, for Korri:

```nix
# nix/images/headless.nix  — federation-bearing image base
services.korri.server = {
  host = lib.mkDefault "0.0.0.0";        # was 127.0.0.1 at the module
  openFirewall = lib.mkDefault true;     # was false at the module
};

services.avahi = {                       # mDNS responder for the always-on advertise
  enable = lib.mkDefault true;
  nssmdns4 = lib.mkDefault true;
  publish = {
    enable = lib.mkDefault true;
    userServices = lib.mkDefault true;
  };
};
```

The **module** keeps its conservative defaults so a one-off
single-machine NixOS host that imports the bare module still gets a
loopback-only korri-server. The **image** then asserts: "if you build
this image, you are participating in federation, full stop."

Every image variant that imports `headless.nix` (currently `kiosk.nix`,
`source-machine.nix`) inherits the posture for free. A deploy that
intentionally must not federate simply does not import the base.

## Why This Matters

Two layers in a NixOS option graph can express the same `host = ...`,
but they encode very different invariants:

| Layer | Invariant |
|-------|-----------|
| Module default | "If nothing else says otherwise, this is the safest fallback." |
| Image-base default | "If you build any image rooted here, this is part of the deal." |

Putting an always-on posture at the module layer makes every consumer
re-declare the same override and creates silent failure modes when one
of them forgets. Putting it at the image-base layer makes it
**impossible** to ship a federation-bearing image that is also bound
to loopback — the override has to happen at the same layer that
*opted in* to the federation posture in the first place.

This is also where the assertion belongs. The corresponding
`korri-image-outputs-check.nix` test was flipped at the same layer:

```nix
(check "kiosk server must listen on all interfaces for federation" (
  kioskSummary.serverHost == "0.0.0.0"
))
(check "kiosk composition must open the federation TCP port (3001)" (
  builtins.elem 3001 kioskSummary.firewallTcpPorts
))
(check "kiosk composition must enable avahi-daemon for federation mDNS" (
  kioskSummary.avahiEnabled && kioskSummary.avahiPublishEnabled
))
```

If a future image disables federation, those assertions fail loudly
at evaluation time rather than at the next "wait, why can't peers see
me?" moment.

## When to Apply

- Zero-backwards-compat architectural flips ("X is now always on") —
  the default must move at the same layer the option was deleted.
- Out-of-band host configs (mountainous, ad-hoc overlays) have been
  silently doing the job that the image base should be doing.
- The same module is used by both fleet-image consumers and one-off
  single-machine consumers, and the right default differs.
- A capability requires more than one option to be coherent (here:
  `host`, `openFirewall`, `services.avahi.enable`) — bundling them at
  the image layer keeps them from drifting apart.

## Examples

**Before** — module owns the defaults, image only adds the user/group:

```nix
# nix/modules/korri-server.nix
host = lib.mkDefault "127.0.0.1";
openFirewall = lib.mkDefault false;

# nix/images/headless.nix
services.korri.server = {
  enable = true;
  user = "korri-server";
  group = "korri-server";
  # host / openFirewall inherited from the module default → loopback only
};
```

A new image consumer that wants federation has to remember to set
three things (`host`, `openFirewall`, avahi). Sobo did not, and the
deploy silently regressed.

**After** — module keeps a conservative fallback; the image asserts the
posture:

```nix
# nix/modules/korri-server.nix  (unchanged, still loopback-only for bare consumers)
host = lib.mkDefault "127.0.0.1";
openFirewall = lib.mkDefault false;

# nix/images/headless.nix  (image is the federation-bearing layer)
services.korri.server = {
  enable = true;
  host = lib.mkDefault "0.0.0.0";
  openFirewall = lib.mkDefault true;
  ...
};
services.avahi.enable = lib.mkDefault true;
services.avahi.publish.enable = lib.mkDefault true;
```

Any single-machine deploy that imports the bare module still gets
loopback. Every kiosk/source-machine image automatically gets
federation, end-to-end testable, on the same commit.

## Related

- `nix/images/headless.nix`, `nix/tests/korri-image-outputs-check.nix`,
  commit `a928f24`.
- `docs/plans/2026-05-27-001-feat-korri-library-federation-plan.md` —
  R14 / R16, the zero-backwards-compat rules that motivated this move.
