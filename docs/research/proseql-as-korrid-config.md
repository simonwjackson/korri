# Is proseQL ready to be korrid's config substrate? — 2026-07-31

korri already has a fragment of a config model, spread across `upstreams.json`,
`host.toml` read in four places, and launcher tables hardcoded in Rust. proseQL
is where that belongs. This checks whether it can actually be consumed.

## It cross-compiles for the phone

`cargo ndk -t arm64-v8a build --release -p proseql-storage` builds
`proseql-engine`, `proseql-formats` and `proseql-storage` in 12 seconds, with
one cosmetic unused-variable warning and no NDK friction at all. Nothing like
the bindgen and libclang work rquickjs needed.

Dependencies are pure Rust throughout: serde, serde_json, thiserror, indexmap,
globset, walkdir, notify, and the format crates.

## The cascade is in Rust, not only in TypeScript

An earlier assumption — that the config cascade lived on the TypeScript side
and korri would have to reimplement it — was wrong.

- **`proseql-formats`** encodes and decodes YAML, JSON, TOML, JSON5, JSONC,
  HJSON and TOON.
- **`proseql-storage`** carries `document_graph`, `document_source`, `fs`,
  `path`, `persistence`, `writer` and `source_config`.
- **`proseql-storage::reload`** provides `LastKnownGood<T>` and
  `ReloadCoordinator<T>`, with `reload(loader)`, `current()` and
  `last_error()`.

That last one is the part worth noticing. Reviewing legacy's
`config-graph-controller` earlier, its generations, last-known-good retention
and per-fragment containment were flagged as hard-won behaviour worth porting
deliberately. It has already been ported, to Rust, with tests.

## Reload is a call, not a watcher

`ReloadCoordinator` is something the caller invokes. `notify` is present as an
optional non-wasm dependency rather than being wired in.

So the shape decided in `watching-config-vs-checking-it.md` — defer the
persistent scanner, reload when korri already knows something changed, keep
serving the last good tree when a rebuild fails — is the library's natural
shape rather than something to work around.

## How korri should take the dependency

Not vendored. Artemis is vendored because korri forks it; proseQL is consumed
unmodified, and vendoring would fork a project under active development.

proseQL's own flake builds its TypeScript packages via bun2nix and exposes no
Nix package for the Rust crates — which does not matter, because korri needs
source, not an artifact. A source-only flake input pins the revision in korri's
`flake.lock`, keeps the Nix sandbox hermetic without `outputHashes`
bookkeeping, and leaves bumping deliberate:

```nix
inputs.proseql = { url = "github:simonwjackson/proseql"; flake = false; };
```

Cargo then depends on `${inputs.proseql}/crates/proseql-engine` and friends.

**Vendor what you fork; depend on what you consume.**

## What remains unknown

- Whether the engine's API is a natural fit for "read fragments, merge a
  cascade, answer questions", or an impedance mismatch. Building against it is
  the only way to find out.
- The FUSE cost measured in `watching-config-vs-checking-it.md` applies here:
  config-sized trees are free, library-sized ones are not.
