---
title: Align the project's nixpkgs to a downstream consumer's pinned channel to avoid aarch64 cache splits
date: 2026-05-27
category: tooling-decisions
module: flake.nix + nix-on-rocks integration
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - "A flake's nixpkgs differs from a downstream consumer's pinned nixpkgs"
  - "Cross-compilation or aarch64 builds are pulling unstable channel paths cache.nixos.org does not serve for the target arch"
  - "Closures are mixing channels via transitive package overlays (`bun2nix`, `playwright-driver`, etc.)"
  - "A nixos-rebuild that should take seconds is rebuilding `nodejs` from source for an hour"
tags: [nixpkgs, nix, cache, aarch64, nix-on-rocks, channel-pin, korri]
---

# Align the project's nixpkgs to a downstream consumer's pinned channel to avoid aarch64 cache splits

## Context

Sobo's federation deploy stalled in the `test` phase of a build that
was rebuilding `nodejs-slim` from source on the aarch64 builder for
nearly an hour before it was killed. The build was triggered by a
normal `nixos-rebuild boot --flake .#korri-odin2portal-kiosk`
that should have been mostly a substitution.

The root cause was a channel split:

- Korri's root flake pinned `nixpkgs = github:NixOS/nixpkgs/nixpkgs-unstable`
  (a rolling `unstable` revision, `f9d8b659`).
- `nix-on-rocks` pinned `nixos-25.11` (`0c88e1f2`).
- The kiosk closure pulled both: `korri.packages.${system}.korri-*`
  brought `bun2nix → nodejs-slim` from Korri's *unstable* nixpkgs into
  the otherwise `nixos-25.11`-flavored guest system.
- `cache.nixos.org` had aarch64 binaries for `nodejs-slim` at the
  `nixos-25.11` revision but **not** at Korri's specific unstable
  revision, so the closure picked up a "build from source" path.

The fix was deliberate channel alignment, not a cache override.

## Guidance

When your flake is a *producer* and another flake pins it transitively,
align your own `nixpkgs` input to the same channel (and ideally the
same revision) as the downstream consumer's pin. This costs you the
freedom of "always latest unstable" and buys you cache coherence
across the whole closure.

Concretely:

```nix
# flake.nix — before
inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

# flake.nix — after
inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
```

then:

```bash
nix flake lock --update-input nixpkgs
```

Verify alignment by reading both `flake.lock` files (yours and the
downstream consumer's) and confirming the `original.ref` matches.
Re-run the full local validation suite (`just typecheck`,
`just test-unit`, plus any unit/integration runner) before committing,
because the channel move is effectively a fleet-wide minor-version
bump of every transitive dependency.

## Why This Matters

A channel mismatch between a "producer" flake and a "consumer" flake is
invisible until the closure ends up on an arch where the producer's
revision is uncached. On x86 with a warm `cache.nixos.org` it
silently substitutes; on aarch64 with sparser coverage it silently
rebuilds. The first symptom is "the deploy took an hour"; the second
is "the build OOM'd on the device's tiny builder."

The trap is that the producer flake *looks* fine in isolation. Every
test passes, every local build works. The split only manifests at the
consumer's build site, often on a different arch and a different
machine than the producer's author. By the time the symptom shows up
you have already lost an hour and the cause is two `flake.lock` files
away.

Aligning the channel is also a **decision** in the durable sense: you
have accepted that this flake's minor-version cadence is now governed
by `nixos-25.11`, not by `unstable`. Document the accepted blast
radius. For Korri the verified deltas were `bun 1.3.13 → 1.3.3`,
`playwright-driver 1.59.1 → 1.56.1`, `retroarch-bare 1.22.2 → 1.21.0`.
Every minor-bumped package is a thing that could surprise you later;
listing them up front turns "what changed?" into "we knew."

## When to Apply

- A downstream NixOS module / image / system flake imports your flake
  and your `nixpkgs` differs from theirs.
- aarch64 builds are pulling source paths cache.nixos.org does not
  serve, and the producer is using `nixpkgs-unstable`.
- A package buried in a transitive overlay (`bun2nix`, `playwright-driver`,
  `electrobun`, anything that snapshots its own `nodejs`/`bun`/etc.)
  is the closure citizen that drags in the off-channel rev.
- You are about to ship a fleet (handheld build, kiosk image) and want
  every device to substitute, not rebuild.

The inverse case — when **not** to align — is when your flake's
*purpose* is to track unstable (e.g. a personal nixpkgs sandbox).
Then the downstream consumer is the one that should follow you, and
the conversation moves there.

## Examples

### Worked example: this session

```diff
# flake.nix
- inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
+ inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
```

```bash
$ nix flake lock --update-input nixpkgs
# nixpkgs: f9d8b659... → b77b3de8...   (commit cba413b)
```

Result: subsequent `nixos-rebuild boot` for the same target pulled
the `nodejs-slim` closure from the cache instead of rebuilding it,
and the deploy completed in ~90 seconds end-to-end.

### Companion pattern: one-off package pins

After alignment, occasionally a single package on the new channel
fails an assertion the closure makes (Korri needed gamescope ≥3.16.20;
`nixos-25.11` shipped 3.16.17). The right local move is **not** to
swing nixpkgs back to unstable for the whole fleet — it is to pin
that one package to a known-good revision via `builtins.fetchTarball`
in the platform overlay:

```nix
# nix/images/platforms/rocknix-sm8550.nix — gamescope pin
let
  gamescopePin = builtins.fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/<rev>.tar.gz";
    sha256 = "...";
  };
in {
  nixpkgs.overlays = [
    (final: prev: {
      gamescope = (import gamescopePin { inherit (final) system; }).gamescope;
    })
  ];
}
```

Same shape as `nix/overlays/korri-x86-compositor.nix`. Delete the pin
once the alignment channel backports the needed version. The
combination is: "fleet stays aligned; one package stays current; the
exception is loud and dated."

## Related

- `flake.nix`, `flake.lock`, commit `cba413b` (root nixpkgs alignment).
- `nix/images/platforms/rocknix-sm8550.nix`, commit `624b499`
  (gamescope explicit-rev pin example).
- nix-on-rocks `flake.lock` is the upstream reference for the pinned
  channel.
