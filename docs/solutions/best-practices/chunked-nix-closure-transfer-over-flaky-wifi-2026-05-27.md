---
title: Ship Nix closures to constrained handhelds in 40-path chunks instead of a monolithic tarball
date: 2026-05-27
category: docs/solutions/best-practices
module: closure-shipping
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Shipping a Nix store closure (>500 MB) to a stock-OS handheld over WiFi
  - The receiver has no `nix-copy-closure`, no `nix-daemon`, no `nix-store --import`, and no working binary cache
  - The WiFi link is WPA2-PSK to a consumer router, ~2.4 GHz, with handheld-grade chipset (Realtek 8821CS, RTL8723DS, etc.)
  - `scp` and `rsync` both stall or disassociate on transfers longer than ~5 minutes
  - The receiver does have `tar`, `gzip` (or `gunzip`), and a stable SSH listener
tags:
  - nix
  - closure
  - shipping
  - ssh
  - wifi
  - handheld
  - busybox
  - korri
  - r36t-max
  - trimui-brick
related_components:
  - moonlight-embedded-korri
  - korri-api
  - korri-portal
related_docs:
  - docs/solutions/best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md
  - docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md
  - docs/solutions/runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md
---

# Ship Nix closures to constrained handhelds in 40-path chunks instead of a monolithic tarball

## Context

Across multiple bringup sessions on R36T MAX (RK3326, EmuELEC 4.7) and earlier on Sobo / Odin 2, the observation is consistent: **monolithic closure transfers over consumer WiFi do not complete reliably.** A single 1.5 GB `tar | ssh 'cat > closure.tar'` pipe stalls partway through, the WiFi disassociates, and the SSH session hangs until ServerAliveInterval kills it.

The pattern is not about bandwidth — the link can sustain 30–50 Mbit/s in short bursts. It is about **sustained-load disassociation**: cheap WiFi chipsets in this class drop the association after several minutes of continuous traffic, regardless of throughput. Power-management quirks, thermal throttling on the radio, or driver bugs are likely contributors. Whatever the cause, it's reproducible.

The workaround is mechanical: **split the closure into chunks of ~40 paths each**, gzip on the fly, send via a fresh SSH connection per chunk. Each chunk completes in 50–80 s before the link gets a chance to misbehave. Chunks are independent — a failed chunk can be retried without restarting the others.

This recipe was validated shipping the **moonlight-embedded-korri** closure (386 paths, 1.56 GB) to a R36T MAX from the host workstation. Monolithic transfer stalled at ~250 MB. Six chunks of 40 paths × ~60 s each completed cleanly.

## Guidance

### 1. Stop fighting the network

The first instinct is to tune ServerAliveInterval, switch to a different SSH cipher, reduce gzip level, or move closer to the AP. None of this matters. The chipset's sustained-load behavior is the structural issue. **Accept it and chunk.**

### 2. Compute the closure path list, then chunk

```sh
# On the workstation
OUT=$(nix path-info .#moonlight-embedded-korri)
nix-store --query --requisites "$OUT" > /tmp/closure-paths.txt
wc -l /tmp/closure-paths.txt
# 386
```

Split into 40-line files:

```sh
split -l 40 -d /tmp/closure-paths.txt /tmp/m1-chunk.
ls /tmp/m1-chunk.*
# m1-chunk.00  m1-chunk.01  m1-chunk.02  m1-chunk.03  m1-chunk.04  m1-chunk.05
```

Six chunks for 386 paths. At ~60 s each, the full closure ships in ~6 min — but each chunk individually is short enough that WiFi never disassociates.

### 3. Stage chunks one at a time over fresh SSH connections

```sh
SSH_ARGS="-o ServerAliveInterval=10 -o ConnectTimeout=5 -p 2222"
DEVICE=root@192.168.1.227
STORE_DST=/storage/nix/store

for chunk in /tmp/m1-chunk.*; do
  echo "=== shipping $chunk ==="
  # On host: tar paths in chunk, gzip, pipe via SSH
  tar -czh --files-from=$chunk -C / | \
    ssh $SSH_ARGS $DEVICE "cd / && tar -xzf -"
  echo "exit: $?"
done
```

Three details that matter:

- **`-h` follows symlinks at the source**, so the closure's symlinks expand to their targets if the targets are also in the chunk. Without `-h`, busybox tar on the receiver may produce dangling links. (Separate failure mode addressed in the busybox-tar doc.)
- **`-C /` on both ends** keeps the store paths at their canonical `/nix/store/...` location. The destination's `/storage/nix/store/` must be bind-mounted or symlinked from `/nix` for this to work — see your image's mount setup.
- **A fresh SSH connection per chunk**. Do not try to keep one connection alive across multiple chunks; you defeat the purpose.

### 4. Verify each chunk completed

After each `ssh ... tar -xzf -` exits 0, do not assume the chunk landed. Verify:

```sh
# On the host: count paths in the chunk
expected=$(wc -l < $chunk)

# On the device: count paths that now exist
ssh $SSH_ARGS $DEVICE "for p in \$(cat /tmp/$chunk-paths); do [ -e \$p ] && echo ok; done | wc -l"
```

If the count is short, retry the chunk. Do not advance.

### 5. Reassemble the closure manifest on the device

After all chunks land, write the full closure path manifest to the device for the launcher to read:

```sh
scp /tmp/closure-paths.txt $DEVICE:/storage/m1-closure-paths.txt
```

This is the source of truth for the launcher's LD path computation (see the moonlight bringup doc and the electrobun-renderer doc).

### 6. Replay symlinks after extraction

Busybox tar on the receiver silently drops a fraction of the symlinks in the extracted closure. **You will not notice this until the closure fails to resolve a runtime dep.** Always run a symlink replay step:

See [busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27](../runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md) for the recipe.

### 7. Cache the chunk archives if iterating

The `tar -czh ... | ssh ... tar -xzf -` form is convenient but throws away the intermediate. If you are iterating on the build, materialize each chunk to a local file:

```sh
for chunk in /tmp/m1-chunk.*; do
  out=/tmp/m1-stage.${chunk##*.}.tgz
  tar -czh --files-from=$chunk -C / > $out
done
```

Then ship one at a time:

```sh
for tgz in /tmp/m1-stage.*.tgz; do
  ssh $SSH_ARGS $DEVICE "cd / && gunzip -c | tar -xf -" < $tgz
done
```

Local copies survive transient failures; you only re-run the chunks that failed. Disk cost is ~1.5 GB for a moonlight-sized closure.

### 8. Do not gzip on the device

The receiver should `tar -xzf -` not `gunzip | tar -xf -`. On busybox, the first form is implemented in a single binary; the second uses two pipes that on some builds add 100% overhead. We measured 70 s vs 130 s for the same 40-path chunk on R36T MAX between the two forms.

## Why This Matters

This recipe trades elegance for reliability. The "right" answer is `nix-copy-closure --to ssh://device`. That requires `nix-daemon` on the receiver. We do not have it on stock EmuELEC and adding it is a multi-step bringup of its own. The "next-right" answer is signed binary cache + `nix-store --import`. That requires `nix-store` on the receiver. Also absent.

The "wrong but actually works" answer is plain tar over SSH. Adding chunking makes it reliable on the worst class of WiFi we ship to. The cost is a 60-line shell loop. The benefit is that bringup on a new handheld becomes mechanical: write the closure, split, ship, verify, replay symlinks, run the launcher.

Once you have a real Nix layer on the device (the next stage, after B0a SSH and B0b mount), this recipe goes away in favor of the proper Nix protocols. Until then, it is the bridge.

## When to Apply

- First-light bringup on a new handheld whose stock OS has no Nix
- The closure is too large to ship monolithically over the link you have
- You can tolerate ~10 minutes of one-time shipping cost per closure
- The device has SSH, tar, gzip, and a writable storage area

Do not apply when:

- `nix-copy-closure` works — use that
- The closure is small (<200 MB) — monolithic transfer is usually fine at that size
- The link is Ethernet, USB-OTG-Ethernet, or 5 GHz WiFi from a quality chipset — sustained transfer is reliable; chunking adds complexity for no benefit

## Examples

### R36T MAX — verified

- Closure: `moonlight-embedded-korri` (386 paths, 1.56 GB)
- WiFi: 2.4 GHz, WPA2-PSK, RTL8821CS chipset on device
- Host: workstation at 192.168.1.243 (same /24 as device)
- Monolithic attempt: stalled at ~250 MB after 3 min 40 s; SSH session hung; required manual disconnect
- Chunked attempt: 6 chunks × 40 paths × 50–80 s = 6 min 12 s total, all chunks exited 0, all paths verified present, symlinks replayed without error

### Failure log from the monolithic attempt

```
$ tar -czh --files-from=/tmp/closure-paths.txt -C / | \
    ssh -p 2222 root@192.168.1.227 "cd / && tar -xzf -"
[... 3 min 40 s ...]
client_loop: send disconnect: Broken pipe
$ ssh -p 2222 root@192.168.1.227 'echo alive'
ssh: connect to host 192.168.1.227 port 2222: No route to host
[ ... 30 s later ... ]
$ ssh -p 2222 root@192.168.1.227 'echo alive'
alive
```

The disassociation is transient. SSH comes back within a minute. The transfer is lost; the partial-tar state on the receiver is half-extracted.

### Chunked recipe in full (sketch)

```sh
#!/bin/sh
set -eu
SSH_ARGS="-o ServerAliveInterval=10 -o ConnectTimeout=5 -p 2222 \
  -o UserKnownHostsFile=$HOME/.ssh/r36t-known-hosts -i $HOME/.ssh/r36t-id"
DEVICE=root@192.168.1.227

# 1. Build manifest
nix-store --query --requisites "$(nix path-info .#moonlight-embedded-korri)" \
  > /tmp/closure-paths.txt

# 2. Split into 40-path chunks
split -l 40 -d /tmp/closure-paths.txt /tmp/m1-chunk.

# 3. Ship each chunk
for chunk in /tmp/m1-chunk.*; do
  echo "=== $chunk ($(wc -l < $chunk) paths) ==="
  tar -czh --files-from=$chunk -C / | \
    ssh $SSH_ARGS $DEVICE "cd / && tar -xzf -"
done

# 4. Ship manifest for the launcher
scp $SSH_ARGS /tmp/closure-paths.txt $DEVICE:/storage/m1-closure-paths.txt

# 5. Verify all paths
ssh $SSH_ARGS $DEVICE 'while read p; do [ -e "$p" ] || echo MISSING $p; done < /storage/m1-closure-paths.txt'

# 6. Replay symlinks — see separate doc
```

## Related

- [moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27](./moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md) — what we shipped using this recipe
- [electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27](./electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md) — earlier closure shipping for cage+webkit
- [busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27](../runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md) — the post-extract repair step
