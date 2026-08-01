# Plugin scripting in korrid

korrid can transpile and run TypeScript or JavaScript **at runtime**, on every
device Korri targets. A plugin is source text that evaluates to a declaration;
korrid performs any resulting effects itself.

Plugin source is evaluated at runtime rather than compiled into native code.
Bundled first-party source still ships through the normal korrid build; future
external plugin sources can be evaluated without a native rebuild once a real
source/installation policy exists.

## Shape

```
plugin.ts  ──(oxc: transpile in-process)──▶  JS  ──(QuickJS: evaluate)──▶  declaration JSON
```

| Layer | Crate | Why this one |
|---|---|---|
| TS → JS | `oxc` | Full transpile, not just type-stripping — `enum`, decorators, parameter properties all work |
| Execute | `rquickjs` (QuickJS) | An interpreter, so Android's restrictions on generating executable code never come into play; also small |

Both cross-compile to `aarch64-linux-android` and `x86_64-linux`. The same
plugin file runs on every device: **source is portable where binaries are not.**

The first bundled production source is `plugins/android-app.plugin.ts`. It is
byte-for-byte pinned to the reviewed checkpoint copy under
`docs/research/android-app-plugin-schema-checkpoint/`, and parity is part of the
check suite so either copy changing alone fails.

## The sandbox is empty on purpose

A plugin gets no module loader, no host bindings, and no I/O. `require`,
`process`, `fetch`, and `XMLHttpRequest` are all `undefined` — asserted in
tests. The rule "plugins declare, korrid performs effects" is therefore
enforced by construction rather than by convention, and a plugin cannot pin
itself to one machine by reaching for local resources.

## Local announcement registry

korrid strictly decodes evaluated declarations into the narrow legacy plugin
seam proven by the Android application schema checkpoint. Bundled plugins are
registered from repository-owned source, and generic policy layers keyed by
plugin ID decide enablement. The built-in layer enables `@korri:android-app` by
default; a later layer can disable the same ID without changing registry code or
adding an Android-specific switch. The user policy layer is intentionally empty
for these slices.

An enabled plugin can currently contribute provider, system, and launcher
records; disabled plugins remain registered but contribute nothing. Unsupported
declaration fields fail explicitly rather than disappearing. As in legacy,
system and launcher contribution keys retain the contributing plugin's identity;
the records inside those entries retain their schema IDs for the later
readable-snapshot slice.

Review that boundary without reading Rust:

```sh
nix run .#korrid-plugin-review
```

The report uses the bundled Android plugin source (kept byte-identical to the
checkpoint copy) and shows both its enabled and disabled states. This registry
is device-local only: it does not yet load persisted configuration, resolve a
library route, perform an Android launch, or publish anything to federation
peers.

## Verified on hardware

Tablet SM-X930 (Android 16, aarch64), running the example plugin: transpile
1.78 ms, evaluate 1.22 ms. Runtime transpilation is not a performance concern
at plugin size.

`nix run .#korrid-script-device -- <adb-serial>` re-runs that check any time. It uses the
standalone `script_probe` binary, so it verifies the arm64 path without adding
anything to the APK.

An earlier in-app proof (since removed, see "Not wired into the app yet") ran
the same plugin inside the Korri app process at 1.06 ms, and picked up an
edited plugin pushed to the running app with no rebuild and no reinstall.

## Cost, if the app carries it

Measured per APK entry, compressed:

| APK entry | without | with | delta |
|---|---|---|---|
| `lib/arm64-v8a/libkorrid.so` | 2,190,553 | 3,694,948 | +1,504,395 |
| `lib/arm64-v8a/liboxc_sourcemap-*.so` | — | 166,186 | +166,186 |
| **total** | | | **+1,670,581 (~1.59 MB)** |

Note that oxc emits a **second** native library beyond `libkorrid.so` — easy to
miss when estimating. Roughly: QuickJS ≈ 0.45 MB, oxc ≈ 1.1 MB compressed.
JavaScript-only plugins (no runtime TypeScript) would save about two thirds.

Do not compare whole-APK totals across different checkouts to derive this. A
baseline APK measured that way showed ~3.35 MB of unexplained slack, which made
the build *with* the runtime look smaller — nonsense. Per-entry comparison is
the trustworthy measure.

## Not a launch path yet

The Android plugin is now bundled and default-enabled through policy, but this
slice still stops at the local announcement registry. Persisted configuration,
route resolution, and Android launch mapping are later slices. The shell still
performs no plugin-specific work, and `command: android-app` must not be treated
as a generic process command.

## Traps, for the next person who touches the build

Fixed in `devshell.nix`, but they return on a new machine or a version bump.

1. **QuickJS ships no ready-made Rust bindings for Android.** They exist for
   common systems but not this target, so the build generates them — which
   needs `libclang` present in the dev shell.
2. **The Android build hands the phone's compiler to jobs meant for this
   computer.** `cargo-ndk` sets the C compiler globally, so host-side build
   steps get the phone's compiler and cannot find local system headers. Fixed
   by pinning `HOST_CC` / `CC_x86_64_unknown_linux_gnu`.
3. **The binding generator doesn't inherit the "building for Android"
   settings.** It runs libclang directly and needs the sysroot spelled out via
   `BINDGEN_EXTRA_CLANG_ARGS`. The Android-scoped spelling of that variable
   silently did nothing; the general one worked. The dashed form cannot be
   exported from bash at all.
4. **TypeScript `enum` panics the transpiler unless scoping is built with
   `with_enum_eval(true)`.** The panic message names the setting.
5. **Network adb targets drop between runs** — reconnect and `wait-for-device`
   before any device step, or a gate fails halfway through.

## Open questions

- **What a plugin may declare**, and how korrid matches declarations to device
  capabilities. This is the capability model, deliberately unbuilt (see
  `AGENTS.md`).
- **Imports between plugin files.** There is no module resolver; a plugin is
  currently a single self-contained file.
- **Runaway plugins.** No execution limits are set: an infinite loop would hang
  the calling thread. QuickJS supports interrupt handlers and memory limits;
  neither is configured yet. This must be settled before any plugin arrives
  from outside the device.
