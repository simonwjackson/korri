---
id: 019fdd3b-6b1e-7dd3-acc0-b16e44783a48
title: Odin 2 Portal stock reconstruction
status: active
created: 2026-08-07
source: direct
---

# Odin 2 Portal stock reconstruction

Build a read-only, fail-closed Nix pipeline that verifies the captured stock 1.0.0.130 source, reconstructs its dynamic `super.img`, and proves the logical partition bytes and layout remain unchanged without contacting or writing to a device.
