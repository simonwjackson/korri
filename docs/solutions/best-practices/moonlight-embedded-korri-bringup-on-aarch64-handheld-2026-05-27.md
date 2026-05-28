---
title: Bring up moonlight-embedded-korri on an aarch64 handheld via prebuilt closure + manifest-driven launcher
date: 2026-05-27
category: docs/solutions/best-practices
module: moonlight-bringup
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Bringing up a Moonlight (GameStream) client on a new aarch64 handheld whose stock OS does not include moonlight-embedded
  - The device is too constrained or too read-only to build moonlight on-device
  - Hardware decode (rkmpp, v4l2m2m, NVDEC) is not yet known-good and software decode is the safe first goal
  - A Nix-based ld-loader + LD_LIBRARY_PATH launcher is acceptable because no FHS exists
  - Pair-and-stream against a Sunshine host on the same LAN is the validation goal
tags:
  - moonlight
  - moonlight-embedded
  - gamestream
  - sunshine
  - aarch64
  - handheld
  - nix
  - closure-shipping
  - korri
related_components:
  - moonlight-embedded-korri
  - korri-stream
  - sunshine
  - libmali
  - cage
related_docs:
  - docs/solutions/best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md
  - docs/solutions/best-practices/korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md
  - docs/solutions/best-practices/korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27.md
---

# Bring up moonlight-embedded-korri on an aarch64 handheld via prebuilt closure + manifest-driven launcher

## Context

Korri ships `moonlight-embedded-korri` (downstream of `nix-on-rocks/moonlight-embedded` with four Korri patches on top). The build itself is reproducible from a flake input. The friction is in the **bringup** — getting that ~1.5 GB closure onto a constrained handheld whose stock OS has none of Nix, none of the right glibc, and a flaky WiFi link.

On the R36T MAX (RK3326, EmuELEC 4.7, 970 MB RAM, software decode only) the verified bringup looks like:

1. Build the package on a real aarch64 Nix builder (`fuji`), not on the device, and not cross-compiled from x86_64.
2. Compute a launcher LD path from the closure's transitive requisites at build time.
3. Ship the closure to the device's external storage (TF card or USB stick mounted at `/storage/nix`).
4. Run via the closure's `ld-linux-aarch64.so.1` with `--library-path` from the precomputed manifest.

At time of writing the device-side recipe is verified through `moonlight --help` and `moonlight pair <ipv4>` producing a Sunshine PIN. Full pair-and-stream is gated on a separate WiFi recovery step.

## Guidance

### 1. Build on a real aarch64 Nix builder

Cross-compiling moonlight-embedded from x86_64 is theoretically possible but the Korri patches + the v4l2m2m platform make this fragile. The reliable path is to build on an aarch64 host that has a recent enough glibc to match what your handheld will see.

```sh
# on the aarch64 builder (in our case: fuji)
git clone <your korri checkout>
cd korri
nix build .#moonlight-embedded-korri
# → /nix/store/0gz7w...-moonlight-embedded-korri-2.7.1-korri
```

The resulting closure on the R36T MAX bringup was **386 paths, 1.56 GB**. The dominant cost is `ffmpeg-full` (codec deps), not moonlight itself.

If you do not have an aarch64 builder, run a `binfmt-misc` aarch64 VM on x86_64. This is slower but works.

### 2. Verify the compiled-in platforms list before shipping

`moonlight-embedded` supports multiple decoder/output platforms, picked at configure time via cmake flags. The `moonlight-embedded-korri` build inherits `nix-on-rocks`' platform set:

| Platform | Use case | Verified on R36T MAX |
|---|---|---|
| `sdl` | Software decode + SDL output. Universal fallback. | ✅ binary runs |
| `v4l2m2m` | Hardware decode on devices with V4L2 M2M (SM8550, some RK) | not on RK3326 — wrong codec |
| `x11` | X11 output | irrelevant on Wayland-only kiosk |
| `ffmpeg_drm` | DRM PRIME zero-copy display | candidate for KMS direct path |
| `pulse` | PulseAudio output | usable if pipewire-pulse shim is present |

**For first-light on a new handheld, pin yourself to `-platform sdl`.** Software decode at 720p is within reach of even a 4× Cortex-A35; you'll see a window with frames. Worry about HW decode after pair-and-stream is green.

```sh
moonlight stream <host-ip> -platform sdl -app "Desktop"
```

### 3. Pre-compute the launcher LD path on the builder

Same idea as the cohesive Electrobun closure recipe ([electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27](../best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md)). The device cannot reliably enumerate `/nix/store/*/lib` itself — too slow on flash, too many false matches, and the closure layout is opaque.

On the builder, after the build:

```sh
OUT=$(nix path-info .#moonlight-embedded-korri)
nix-store --query --requisites "$OUT" > closure-paths.txt
# 386 entries on R36T MAX

# Keep only paths that actually contribute libs
for p in $(cat closure-paths.txt); do
  if [ -d "$p/lib" ] && ls "$p/lib"/*.so* >/dev/null 2>&1; then
    echo "$p/lib"
  fi
done > ld-path-dirs.txt
# 334 dirs on R36T MAX after filter

paste -sd ':' ld-path-dirs.txt > ld-path-string.txt
```

Ship `closure-paths.txt`, `ld-path-string.txt`, and the closure tar together.

### 4. The launcher script: invoke the closure's own ld-linux

The device's `/lib/ld-linux-aarch64.so.1` (if it has one) is unlikely to match the closure's glibc. **Use the loader from the closure**, not the device's loader.

```sh
#!/bin/sh
# /storage/run-moonlight.sh
set -eu

STORE=/storage/nix/store
LDPATH_CACHE=/storage/.moonlight-ld-path

# Resolve closure paths
LOADER=$(echo $STORE/*-glibc-*/lib/ld-linux-aarch64.so.1 | awk '{print $1}')
MOONLIGHT=$(echo $STORE/*-moonlight-embedded-korri-*/bin/moonlight | awk '{print $1}')

# LD path is cached on first run from /storage/m1-closure-paths.txt manifest
if [ ! -f "$LDPATH_CACHE" ]; then
  : > "$LDPATH_CACHE.tmp"
  while IFS= read -r p; do
    if [ -d "$p/lib" ]; then
      ls "$p/lib"/*.so* >/dev/null 2>&1 && printf '%s/lib\n' "$p" >> "$LDPATH_CACHE.tmp"
    fi
  done < /storage/m1-closure-paths.txt
  paste -sd ':' "$LDPATH_CACHE.tmp" > "$LDPATH_CACHE"
  rm "$LDPATH_CACHE.tmp"
fi

LD_PATH=$(cat "$LDPATH_CACHE")

exec "$LOADER" --library-path "$LD_PATH" "$MOONLIGHT" "$@"
```

The first invocation pays the LD-path computation cost (a few seconds on slow flash). Subsequent invocations are instant.

### 5. Pair via raw IPv4, not `host.local`

Moonlight pair handshakes use mDNS for discovery but the actual TCP pair flow against the Sunshine host needs reachable v4 routing. On EmuELEC with WiFi-only:

```sh
# mDNS often returns AAAA (IPv6) first
getent hosts aka.local
# → 2605:b40:1524:e800::5a6  aka.local

# moonlight will try the IPv6 first; the v6 path is not actually routable
# over WiFi-only networks, even when the v4 path is fine
moonlight pair aka.local        # likely hangs
moonlight pair 192.168.1.117    # succeeds
```

Resolve the Sunshine host to an explicit IPv4 address before pairing. Capture it in your launcher config; don't rely on the device's IPv6 stack.

### 6. Shipping the closure to a constrained handheld

This deserves its own recipe and has one: see [chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27](./chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md). The short version:

- Don't ship a single 1.5 GB tarball over WiFi. WPA association drops on sustained transfers >5 min.
- Split into **40-path chunks**, gzipped, piped via SSH. ~50–80s per chunk on weak WiFi.
- Expect symlink loss on busybox-tar receivers. See [busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27](../runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md) for the manifest-replay recovery.

### 7. Smoke-test before pairing

Before consuming a Sunshine PIN (which you only get one of per session), prove the binary works:

```sh
# 1. moonlight prints usage banner cleanly
/storage/run-moonlight.sh --help | head -20

# 2. moonlight initiates DNS for the host
/storage/run-moonlight.sh map -map gameJoy.map 192.168.1.117 2>&1 | grep -E 'connect|resolv'

# 3. pair (this consumes a PIN; Sunshine prompts on the host)
/storage/run-moonlight.sh pair 192.168.1.117
```

If step 1 fails, your LD path is wrong. If step 2 fails, your network isn't reachable. Only step 3 proves the GameStream stack initializes.

### 8. Stop the kiosk before streaming

The kiosk (cage + electrobun + bun api) holds the DRM master. Moonlight cannot acquire DRM PRIME with a master already attached. Always:

```sh
systemctl stop korri-kiosk.service
# 60-second safety net before risky experiments
systemd-run --on-active=60 --unit=korri-kiosk-recover systemctl start korri-kiosk.service

cage -s -- /storage/run-moonlight.sh stream 192.168.1.117 \
  -platform sdl -app "Desktop"

# If you got here without the timer firing, cancel it
systemctl stop korri-kiosk-recover.timer
systemctl start korri-kiosk.service
```

The 60-second safety net mirrors the pattern in [korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27](./korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27.md). If the moonlight binary segfaults or cage cannot take over, the kiosk comes back automatically.

## Why This Matters

The temptation when porting moonlight to a new handheld is to build on-device, link against the device's libs, and run from `/usr/bin`. None of that is available on stock-OS handhelds: no compiler, no recent glibc, no writable `/usr`. The Nix closure approach handles all four:

- The compiler problem moves to the builder.
- The glibc problem becomes "ship the right ld-linux".
- The library problem becomes "build LD path from manifest".
- The writable-path problem becomes "everything lives under `/storage/nix/store/`".

The pre-computed manifest is the unlock that makes the device-side launcher cheap and deterministic. Without it, a `find /nix/store -type d -name lib` on slow flash dominates the launcher's cold start.

The IPv6 mDNS trap is real and easy to dismiss as "the device is broken." It is not — moonlight's behavior is reasonable; mDNS preferring AAAA records is reasonable; WiFi-only networks not routing v6 cleanly is the actual failure. Pin to IPv4 and move on.

## When to Apply

- Porting moonlight to a new handheld that lacks moonlight-embedded packaging
- Shipping moonlight to any aarch64 device whose userspace is too lean for nixpkgs's default closure
- The build is too expensive to redo on-device (always)

Do not apply when:

- You have a working FHS distro (Armbian, Debian) with moonlight-embedded packaged — just install the package
- You want hardware decode on RK3326 — `moonlight-embedded-korri` does not ship rkmpp; you'd need a separate platform patch
- The host is already streaming via a different protocol (Steam Link, Parsec) and that works — moonlight is not always the right tool

## Examples

### Verified — R36T MAX, RK3326, EmuELEC 4.7

- Builder: `fuji` (NixOS aarch64, glibc 2.42-51)
- Build output: `/nix/store/0gz7wgzlx9pblyzk418644i4nmgd3ag1-moonlight-embedded-korri-2.7.1-korri` (closure 386 paths, 1.56 GB)
- Device receive: TF card mounted at `/storage/nix`, ext4
- Closure file count after symlink replay: 906 paths total on TF (includes earlier electrobun/korri-api closures)
- `moonlight --help` produces full usage banner
- `moonlight pair 192.168.1.117` reaches Sunshine on aka, PIN 2459 issued
- Stream verification pending — gated on device WiFi recovery (see SD-boot rescue doc)

### Compiled-in platforms (this build)

```
$ moonlight stream 192.168.1.117 -platform ???
Available platforms: sdl, v4l2m2m, x11, ffmpeg_drm, pulse
```

### Closure manifest format on device

```
$ head /storage/m1-closure-paths.txt
/nix/store/0gz7wgzlx9pblyzk418644i4nmgd3ag1-moonlight-embedded-korri-2.7.1-korri
/nix/store/jjjpj4p9bz505ac1c747f2j5z3xw170p-glibc-2.40-224
/nix/store/0r1z2n93l1ad15zqsk6xfflbk6m5pp7b-ffmpeg-full-7.0.2-bin
...
```

386 lines total. Filtering down to dirs with `.so` files gives the 334 entries the launcher actually adds to `LD_LIBRARY_PATH`.

## Related

- [electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27](./electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md) — same cohesive-closure pattern applied to electrobun
- [korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27](./korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md) — companion server-side shipping
- [korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27](./korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27.md) — the safety-net timer pattern reused here
- [chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27](./chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md) — how the closure actually got to the device
- [busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27](../runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md) — recovery for the receive-side symlink loss
