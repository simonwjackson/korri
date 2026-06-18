# libretro-fake-08

`libretro-fake-08` packages the fake-08 PICO-8 reimplementation as a libretro
core, so the Korri kiosk closure can launch `.p8` carts through RetroArch
from inside the Nix-on-rocks guest.

- **Upstream:** [`jtothebell/fake-08`](https://github.com/jtothebell/fake-08)
- **License:** MIT
- **What's vendored:** a single libretro core (`fake08_libretro.so`) plus the
  source-tree `fake08_libretro.info` metadata file. Nothing else from
  upstream's standalone SDL2 player is included.

## Why this lives with the PICO-8 plugin

`fake-08` is not in upstream nixpkgs. ROCKNIX ships a `fake08-lr` package
on the host, but Korri launches everything from inside the guest closure,
so the host packaging is unreachable. A guest-side derivation is required.
The PICO-8 BBS acquisition provider and fake-08 runtime form one first-party PICO-8
bundle: the provider discovers carts and the runtime executes them.

## Source pin policy

The source is pinned via the `fake-08-src` flake input in the repo root
`flake.nix`. The input is `git+https` (not `github:`) with
`submodules=1`, because the libretro Makefile depends on the in-tree
`libs/z8lua` submodule that GitHub's tarball fetch would silently omit.

Current pin: commit `0d26fd59103941e5f95e0ee665c6e0fb8c6b6f03` (2024-09-02),
the same revision ROCKNIX ships in its `fake08-lr` package. This commit
post-dates upstream's `<cstdint>` include fixes; the older `v0.0.2.20`
tag (2023-03-07) fails to compile on gcc 13+ with `'uint8_t' does not
name a type` errors.

Bump with:

```
nix flake update fake-08-src
```

and re-run `nix flake check` to verify the closure-shape check still passes.

## How RetroArch consumes this

The package conforms to the nixpkgs `mkLibretroCore` contract that
`pkgs.retroarch-bare.passthru.wrapper { cores = [ ... ]; }` reads:

- `pname = "libretro-fake-08"` (matches `pkgs.libretro.*` naming)
- `passthru.libretroCore = "/lib/retroarch/cores"` — string path the
  wrapper concatenates onto each core's outPath to compose `-L` flags
- `passthru.core = "fake08"` — string identifier the wrapper's
  `longDescription` reads and the kiosk closure-shape check asserts on

The PICO-8 plugin's NixOS module exposes this core at the stable runtime path `/etc/korri/cores/fake08_libretro.so`. The RetroArch plugin owns the flag-free `retroarch-bare` wrapper; PICO-8 only contributes the fake-08 runtime and requires explicit RetroArch enablement. Launch YAML should model fake-08 as a runtime owned by the PICO-8 plugin and hosted by the RetroArch plugin app:

```yaml
apps:
  "@korri:retroarch/retroarch":
    kind: "@korri:retroarch"
    command: retroarch
    plugin:
      "@korri:retroarch": {}

runtimes:
  "@korri:pico8/fake08":
    kind: libretro-core
    app: "@korri:retroarch/retroarch"
    path: /etc/korri/cores/fake08_libretro.so
    supports:
      systems: [pico8]

systems:
  pico8:
    apps:
      - id: "@korri:retroarch/retroarch"
        runtime: "@korri:pico8/fake08"
```

Every kiosk image (Sobo, Thor, x86 kiosk, live USB) inherits the RetroArch plugin's wrapper when RetroArch is enabled. fake-08 remains a plugin-owned runtime core exposed by this PICO-8 module; it is not appended to the RetroArch wrapper's default core list.

## Runtime ownership constraint

The RetroArch plugin owns the RetroArch binary wrapper and Nix-provided default libretro cores such as mGBA. The PICO-8 plugin owns only fake-08: its package, its stable `/etc/korri/cores/fake08_libretro.so` path, and the `@korri:pico8/fake08` runtime record. This keeps RetroArch generic while still letting PICO-8 fail closed unless the RetroArch plugin is explicitly enabled.

New libretro cores belong in the plugin that owns their user-facing system/runtime contract. Nix-provided generic emulator cores can live in the RetroArch plugin; licensed or domain-specific cores should remain in their own plugin/module opt-ins.

## Layout

```
product/plugins/pico8/packages/libretro-fake-08/
├── README.md       # this file
├── package.nix     # stdenv.mkDerivation wired through the PICO-8 plugin composition
└── check.nix       # colocated package-level check exposed as
                    # self.checks.<system>.libretro-fake-08-check
```

The colocated `check.nix` is a new convention this package introduces:
package-level "is the artifact correct" assertions live next to the
package, while system-level closure-shape assertions remain under
`tools/testing/nix/` alongside the existing per-platform config checks.

## Out of scope

- The licensed standalone `pico8_64` binary (requires a Lexaloffle license).
- PICOLOVE, LIKO-12, TIC-80, zepto8, or any other PICO-8-flavored runtime.
- Additional libretro runtimes beyond `@korri:pico8/fake08`. New libretro cores should be packaged separately and enabled through product/image opt-ins.
- ROCKNIX host changes (host-side `fake08-lr` is unreachable from the
  guest closure and not consulted).
