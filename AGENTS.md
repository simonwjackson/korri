# Korri (main)

This branch is a deliberate restart. Architecture and folder structure are
being decided as each end-to-end slice lands — do not assume conventions from
the `legacy` branch apply here unless this file says so.

## Rules of engagement

- `legacy` is read-only reference material. Harvest code from it deliberately;
  never merge it wholesale.
- Bring in as little as possible per slice. If a slice doesn't need it, it
  doesn't come over.
- The first platform target is Android (Artemis-based streaming client).
- Read before you touch. Do exactly what was asked. No bonus refactors.

## Map

```
clients/android/   Kotlin/Java shell: Artemis streaming core, native pairing,
                   WebView host, bridge implementation (all hardware truth)
clients/portal/    TS launcher UI + in-process brain, runs in the shell's
                   WebView; browser dev via in-memory bridge + keyboard input
contracts/         treaties between deployables; imports nothing outside
                   contracts/; when sides disagree, the contract file wins
services/korrid/   (future) host-side daemon — thin hosting of the brain
platform/ts/       (future) brain modules shared by portal and korrid; a
                   module moves here when it has a second real consumer
```

One shared model of how Korri behaves; each platform meets it as well as it
can, and the gap is absorbed at the edge — never leaked into the core or UI.

## Standing decisions

- WebViews are hardware-blind: they receive semantic input actions
  (`direction`, `confirm`, `back`, …) via the bridge, never key codes.
  Kotlin owns all hardware translation.
- The JS↔Kotlin bridge treaty lives in `contracts/bridge/`; the Kotlin
  implementation mirrors it by hand and cites it.
- `flake.nix` is an index: inputs + per-area composition only. Toolchains
  live in `<area>/devshell.nix`. No inline derivations or shells.
- The `justfile` owns cross-area glue (e.g. bundling the portal into APK
  assets); per-area commands stay inside their area.
- Effect is not in the tree yet; it arrives with the korrid RPC slice.
  Seams (bridge services, state ADTs) are shaped so that conversion to
  Effect services/layers/atoms is mechanical.
