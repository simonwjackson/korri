---
id: 01KY2SBHTD02TYR2PB4M5APR93
slug: home-btn-mode-is-still-visible-to-x86-fex-steam-games-read-f
title: Home (BTN_MODE) is still visible to x86/FEX Steam games (read-filter gap)
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - input
  - fex
created: 2026-07-21
source: se-debug
---

# Home (BTN_MODE) is still visible to x86/FEX Steam games (read-filter gap)

## Why it matters

The Steam input-guard has two jobs: no-op EVIOCGRAB (now FEX-covered via seccomp) and filter BTN_MODE out of read() so games don't act on the Home button. The read()-content filter is a libc interposer that FEX raw reads bypass, and seccomp cannot rewrite read() buffers. So x86/FEX games can still see Home presses and may react in-game even though Korri's Home chord now works. Minor (not breaking), but it means Home isn't fully reserved for Korri on x86 titles.

## Acceptance Criteria

- [ ] x86/FEX Steam games do not receive BTN_MODE (Home) events, matching native aarch64 behavior
- [ ] A test/verification demonstrates Home is filtered for an emulated payload

## Related

- `product/plugins/steam/packages/steam-korri/src/steam-input-guard.c`
