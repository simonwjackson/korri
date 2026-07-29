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
clients/portal/    TS launcher UI, runs in the shell's WebView; talks to the
                   korrid brain over localhost RPC; browser dev via in-memory
                   bridge + keyboard input
contracts/         treaties between deployables; imports nothing outside
                   contracts/; when sides disagree, the contract file wins.
                   contracts/bridge/ is hand-written; contracts/generated/ is
                   Typeshare output from Rust (read-only)
services/korrid/   Rust brain. Ships two ways: a standalone binary (dev/host)
                   and a cdylib embedded in the Android app, both serving RPC
                   on localhost
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
- Services are Rust. Wire types live in Rust and are exported through
  Typeshare into `contracts/generated/` — those files are read-only;
  regenerate them via `services/korrid/check.sh`, never edit by hand.
- The portal's brain is always korrid at `http://127.0.0.1:<port>`; the
  portal never talks to host daemons or any other backend directly. On
  Android the shell embeds korrid as a cdylib and injects the port.
- The Effect-RPC envelope client in `services/korrid/src/upstream.rs` is
  scaffolding for talking to the legacy host daemon; it dies with the
  host-side Rust rewrite. Do not grow abstractions around it.
