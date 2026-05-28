---
title: Busybox tar silently drops symlinks during closure extract; replay from manifest
date: 2026-05-27
category: runtime-errors
module: closure-shipping
problem_type: runtime_error
component: tooling
severity: high
symptoms:
  - "Nix closure extracted on a busybox-tar receiver appears complete but the binary fails to resolve runtime libraries"
  - "`ldd` reports `not found` for libs whose canonical store path exists but whose ABI-versioned symlink (libfoo.so.1 → libfoo.so.1.2.3) does not"
  - "`find /nix/store -type l | wc -l` on device returns far fewer symlinks than the same command on the builder"
  - "Tarball was extracted exit-0; nothing in the receiver's logs hints at a partial extract"
  - "Symlink count on receiver is ~65% of builder; nominal symlink-to-file ratio for a typical Nix closure is 1:3"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
applies_when:
  - "Extracting a Nix closure tarball on a receiver that uses busybox tar (EmuELEC, Alpine, OpenWRT, BuildRoot, OpenELEC)"
  - "The closure contains the typical mix of regular files and many same-target ABI symlinks (libfoo.so → libfoo.so.1 → libfoo.so.1.2.3)"
  - "Multiple chunks are extracted sequentially and later chunks may overlap-conflict with earlier ones"
related_components:
  - moonlight-embedded-korri
  - korri-api
  - korri-portal
  - cage
related_docs:
  - docs/solutions/best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md
  - docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md
  - docs/solutions/best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md
tags:
  - busybox
  - tar
  - symlink
  - nix
  - closure
  - emuelec
  - bringup
  - r36t-max
  - trimui-brick
---

# Busybox tar silently drops symlinks during closure extract; replay from manifest

## Context

Shipping a Nix closure to a stock-OS handheld means extracting the closure tar with whatever tar the receiver has. On EmuELEC, JELOS, ROCKNIX, ArkOS, and most BuildRoot-derived stock OSes, that is **busybox tar**, not GNU tar.

Busybox tar implements the tar format well enough for normal use, but it has a quiet failure mode on Nix closure extracts: **when a symlink and a regular file occupy the same path (which happens in normal closure layouts because tar lists them in archive order, and chunked transfers can re-extract overlapping dirs), busybox tar silently keeps the regular file and drops the symlink.** No warning. No error. Exit code 0.

On the R36T MAX bringup, this caused:

- `moonlight-embedded-korri` closure extracted across 6 chunks
- Total symlinks in source closure: **3595** (counted via `find $closure -type l` on builder)
- Symlinks present after busybox extract: **2348** (38% lost)
- The dropped symlinks were exactly the ABI-version chain links: `libfoo.so → libfoo.so.1`, `libfoo.so.1 → libfoo.so.1.2.3`
- `moonlight --help` failed: `ld-linux-aarch64.so.1: libcurl.so.4: cannot open shared object file: No such file or directory`
- The actual file `libcurl.so.4.8.0` was present in the store
- The chain `libcurl.so.4 → libcurl.so.4.8.0` was not

This is recoverable but only because we have the closure manifest. The fix is mechanical: enumerate the expected symlinks on the builder, ship the manifest, replay with `ln -sf` on the device.

## Guidance

### 1. Detect the loss

After any closure extract on a busybox-tar receiver, **count and compare**:

```sh
# On the builder (where the closure was just built)
find $CLOSURE_ROOT -type l | wc -l

# On the device (after extract)
find $STORE_DST -type l | wc -l
```

If the device count is materially lower than the builder count (>5% difference), you have lost symlinks. On typical Nix closures the ratio is symlinks : files ≈ 1 : 3; a closure with 10,000 files has roughly 3,000 symlinks. Substantial deviation is the alarm.

For a R36T MAX-size closure (386 paths, 1.56 GB) the builder count of ~3600 symlinks vs the receiver count of ~2300 was the clear tell.

### 2. Generate the symlink manifest on the builder

Before shipping the closure, capture every symlink along with its target:

```sh
# On the builder
find $CLOSURE_ROOT -type l -printf '%p -> %l\n' > /tmp/m1-symlinks.txt
wc -l /tmp/m1-symlinks.txt
# 3595
```

This is the truth file. Each line: `<symlink path> -> <target>`. The target is the value of `readlink` and may be absolute (under `/nix/store/...`) or relative (`../lib/libfoo.so.1.2.3`).

### 3. Convert to a replay script

```sh
awk -F ' -> ' '{
  printf "ln -sfn %s %s\n", $2, $1
}' /tmp/m1-symlinks.txt > /tmp/m1-symlinks.sh
```

3595 `ln -sfn` calls. Ship this script to the device alongside the closure.

`-s` symbolic, `-f` force, `-n` treat existing symlink target as ordinary file (do not dereference). The `-n` is the key flag — without it `ln -sf foo bar/` follows `bar` if it is a symlink to a dir and creates `bar/foo` instead of replacing `bar`.

### 4. Make the closure paths writable before replay

Nix store paths arrive read-only. `ln -sfn` over a regular file requires write permission on the containing directory:

```sh
# On the device, after closure extract
chmod -R u+w $STORE_DST
sh /storage/m1-symlinks.sh
# 3595 ln -sfn lines run; expect zero errors
```

If you forget the `chmod`, `ln -sfn` returns errors like `Permission denied`. The replay produces no symlinks. You discover at runtime that the closure still fails to resolve.

### 5. Re-seal as read-only after replay (optional)

`/nix/store/` paths in a working Nix install are read-only via `chmod -R a-w`. After replay, you can re-seal:

```sh
chmod -R a-w $STORE_DST
```

Optional. Useful if you want to prevent accidental further edits and your services don't need to write to `/nix/store/` (they shouldn't, by Nix's contract).

### 6. Validate by re-counting

```sh
find $STORE_DST -type l | wc -l
# Should now match the builder count (3595)
```

And functionally:

```sh
$STORE_DST/../bin/moonlight --help | head -5
# Should print usage banner with no library errors
```

### 7. Capture this in the closure-shipping wrapper

The symlink replay is not optional. Encode it in the shipping script so it runs after every extract, every time:

```sh
#!/bin/sh
set -eu

# 1. Ship closure (chunked, see other doc)
# 2. Ship symlink manifest
# 3. Replay
ssh $SSH_ARGS $DEVICE "
  chmod -R u+w $STORE_DST
  sh /storage/m1-symlinks.sh
  # optional: chmod -R a-w $STORE_DST
"

# 4. Verify
expected=$(wc -l < /tmp/m1-symlinks.txt)
actual=$(ssh $SSH_ARGS $DEVICE "find $STORE_DST -type l | wc -l")
echo "symlinks: builder=$expected device=$actual"
[ "$expected" = "$actual" ] || { echo "MISMATCH"; exit 1; }
```

A 5-line bash check is cheaper than a half-hour debugging session at the moonlight launcher.

## Why This Matters

Busybox tar's behavior here is not a bug per se — POSIX is ambiguous about overlapping entries. It is a behavioral mismatch from GNU tar that is **invisible** unless you specifically check.

The failure surfaces at the worst time: at runtime, in a launcher that does many indirect library lookups, with `Permission denied` or `not found` errors that lead you to think the closure is missing files (it is not — only its symlinks).

Capturing the symlink manifest at build time and replaying on the device makes the contract explicit:

- Builder: "I will tell you exactly what symlinks should exist."
- Device: "I will recreate them after extract, regardless of what tar did or didn't do."

This converts a fragile, environment-dependent step into a deterministic one. Same reason we compute the LD path on the builder rather than discovering it on-device.

The replay also defends against future failure modes we haven't seen yet: a different busybox build with different overlap behavior, a different stock OS with different tar, a partial chunk transfer that lost the second occurrence of a symlink. All of them are caught by the same replay step.

## When to Apply

- After any tar-based closure extract on a stock-OS handheld
- Before running any binary from the extracted closure
- As a standing post-extract gate in your closure-shipping script

Always apply — there is no scenario where running the replay on a healthy closure makes things worse.

## Examples

### R36T MAX — verified

- Closure: `moonlight-embedded-korri` (386 paths)
- Builder symlinks: 3595
- After chunked extract: 2348
- Loss: 1247 (34%)
- After replay: 3595 (match)
- `moonlight --help` post-replay: clean output, full usage banner

### Symlink manifest format

```
$ head -3 /tmp/m1-symlinks.txt
/nix/store/abc123-libcurl-8.4.0/lib/libcurl.so.4 -> libcurl.so.4.8.0
/nix/store/abc123-libcurl-8.4.0/lib/libcurl.so -> libcurl.so.4
/nix/store/def456-libssh2-1.11.0/lib/libssh2.so.1 -> libssh2.so.1.0.1
```

Targets are usually relative (within the same lib/ directory). Some chains span directories (Nix's `propagated-build-inputs` glue layer).

### Replay script first 3 lines

```
$ head -3 /tmp/m1-symlinks.sh
ln -sfn libcurl.so.4.8.0 /nix/store/abc123-libcurl-8.4.0/lib/libcurl.so.4
ln -sfn libcurl.so.4 /nix/store/abc123-libcurl-8.4.0/lib/libcurl.so
ln -sfn libssh2.so.1.0.1 /nix/store/def456-libssh2-1.11.0/lib/libssh2.so.1
```

Each line is a single `ln -sfn`. 3595 lines run in well under a minute even on slow flash.

### Counter-example: GNU tar receiver

If your receiver has GNU tar (Armbian, Debian, NixOS), this issue does not manifest. GNU tar handles overlapping entries by replacing the regular file with the symlink, which is what we want for a Nix closure. The replay step is still harmless; it just always exits clean.

## Related

- [chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27](../best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md) — companion shipping recipe
- [moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27](../best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md) — first case study
- [electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27](../best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md) — the other large closure subject to this
