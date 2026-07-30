# Declare Korri tasks in Nix, retire just

- id: 20260730-nix-task-migration
- status: active
- created: 2026-07-30
- plan: plan.md
- foundation: spike/nix-apps (1533ad69, 12b23662) — device, Gradle, and pure tasks all proven shellHook-free
- driver: agents are the only consumers of these commands; discoverability must serve them, and every dependency must be declared

## Device regression gate

Validated on 2026-07-30 against the connected Pixel 3 (`100.78.250.119:37449`), approved as the available substitute for the unreachable SM-X930:

- `nix run .#korrid-check-device` passed: APK install, portal asset load, embedded korrid RPC, local-game declaration, launch declaration, and session status.
- `nix run .#korrid-script-device -- 100.78.250.119:37449` passed and returned the example catalog declaration with both fulfilment routes.
- `nix run .#ra-accept -- 100.78.250.119:37449` preserved build → deploy ordering, built the verified APK, and installed `com.korri.retroarch`. Lifecycle acceptance then stopped at its explicit coexistence prerequisite because stock RetroArch is not installed on this Pixel. The developer accepted build/deploy evidence for this task migration; stock-coexistence behavior was not re-proven on this substitute device.
