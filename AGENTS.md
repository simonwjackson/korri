# Korri (main)

This branch is a deliberate restart. Architecture and folder structure are
being decided as each end-to-end slice lands — do not assume conventions from
the `legacy` branch apply here unless this file says so.

## Rules of engagement

- `legacy` is read-only reference material. Harvest code from it deliberately;
  never merge it wholesale.
- Bring in as little as possible per slice. If a slice doesn't need it, it
  doesn't come over.
- The first platform target is Android (Artemis-based shell).
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
services/korrid/   Rust brain, one per device. Ships as a standalone binary
                   with a configured bind, and as a cdylib embedded in Android
                   serving capability-bound RPC on localhost
```

One shared model of how Korri behaves; each platform meets it as well as it
can, and the gap is absorbed at the edge — never leaked into the core or UI.

## Federation

Korri is a federation of devices, not hosts and clients. A device is defined
by the capabilities attached to it — a screen, controllers, an encoder, fast
storage, an internet connection, the ability to run a given kind of content —
and any device may have any subset, including none. No device holds a role.

Consequences that bind design:

- Content declares what it needs; devices advertise what they can do; the
  federation matches the two. The same content may have several fulfilment
  routes (Wario Land 4 plays locally on the tablet *and* streams from a device
  running RetroArch). A route is chosen, never assumed.
- Logic that could run anywhere must not perform its own effects. Plugins,
  launchers, and acquisition return declarations — what should exist, what
  should run — and korrid performs the effect on whichever device holds the
  capability. Code that downloads, writes, or spawns directly is pinned to one
  machine forever. `services/korrid/src/launcher/` is the reference shape.
- Every device runs its own korrid. Peers are peers; direction belongs to an
  individual call, never to the architecture.

Names that predate this framing — `upstream`, host mode, `Game.host` — are
shorthand for "peer with a given capability set". Don't extend them; rename
when the surrounding code is next touched.

Guard: the capability model is deliberately unbuilt. Do not invent it ahead of
real cases. Today that is three devices and one genuinely multi-route piece of
content — shape for federation, build no more than the cases demand.

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
- The portal's brain is always the korrid on its own device at
  `http://127.0.0.1:<port>`; the portal never talks to another device's korrid
  or any other backend directly. On Android the shell embeds korrid as a
  cdylib and injects the port.
- Peer korrids speak the native tagged `/rpc` wire. The Effect-RPC envelope
  client in `services/korrid/src/upstream.rs` exists only for aka until it is
  migrated; it dies at switchover. Do not grow abstractions around it.
