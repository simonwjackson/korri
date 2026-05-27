# libretro-fake-08

`libretro-fake-08` packages the fake-08 PICO-8 reimplementation as a libretro
core, so the Korri kiosk closure can launch `.p8` carts through RetroArch
from inside the Nix-on-rocks guest.

- **Upstream:** [`jtothebell/fake-08`](https://github.com/jtothebell/fake-08)
- **License:** MIT
- **What's vendored:** a single libretro core (`fake08_libretro.so`) plus the
  source-tree `fake08_libretro.info` metadata file. Nothing else from
  upstream's standalone SDL2 player is included.

## Why this lives in Korri

`fake-08` is not in upstream nixpkgs. ROCKNIX ships a `fake08-lr` package
on the host, but Korri launches everything from inside the guest closure,
so the host packaging is unreachable. A guest-side derivation is required.

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

Korri's kiosk product module (`nix/images/kiosk.nix`) injects exactly
this one core into a `retroarch-bare` wrapper and adds it to
`services.korri.compositor.path`. Every kiosk image (Sobo, Thor, x86
kiosk, live USB) inherits the same minimal RetroArch closure.

## Single-core constraint

The kiosk RetroArch wrapper carries **exactly one** libretro core,
`libretro-fake-08`. This is intentional and enforced at evaluation time
by assertions in:

- `nix/tests/korri-rocknix-sm8550-config-check.nix` (Thor + Sobo)
- `nix/tests/korri-live-usb-config-check.nix` (Product + Developer)
- `nix/tests/korri-image-outputs-check.nix` (x86 kiosk + both live USB)

Each asserts the kiosk's compositor PATH contains exactly one
`retroarch-bare` wrapper, that the wrapper's `passthru.cores` list has
length 1, and that the single core's `passthru.core` is `"fake08"`.

New libretro cores belong in **their own packages with their own
opt-in**, not as additional entries appended to the kiosk wrapper. The
no-other-cores guarantee is what lets every Korri kiosk image carry
RetroArch without growing the per-image closure for every user.

## Layout

```
packages/libretro-fake-08/
├── README.md       # this file
├── package.nix     # stdenv.mkDerivation wired through nix/overlays/korri-packages.nix
└── check.nix       # colocated package-level check exposed as
                    # self.checks.<system>.libretro-fake-08-check
```

The colocated `check.nix` is a new convention this package introduces:
package-level "is the artifact correct" assertions live next to the
package, while system-level closure-shape assertions remain under
`nix/tests/` alongside the existing per-platform config checks.

## Out of scope

- The licensed standalone `pico8_64` binary (requires a Lexaloffle license).
- PICOLOVE, LIKO-12, TIC-80, zepto8, or any other PICO-8-flavored runtime.
- Korri cascade YAML entries (system / launcher / core records) that
  resolve a `.p8` cart to `retroarch -L fake08_libretro.so <cart>`.
  Those are picked up by a separate cascade-side plan; once that lands,
  the generic foreground-session policy added in the foreground-session
  phase 1-3 work will promote RetroArch to the foreground at launch.
- ROCKNIX host changes (host-side `fake08-lr` is unreachable from the
  guest closure and not consulted).
