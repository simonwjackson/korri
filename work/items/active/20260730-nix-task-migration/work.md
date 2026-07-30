# Declare Korri tasks in Nix, retire just

- id: 20260730-nix-task-migration
- status: active
- created: 2026-07-30
- plan: plan.md
- foundation: spike/nix-apps (1533ad69, 12b23662) — device, Gradle, and pure tasks all proven shellHook-free
- driver: agents are the only consumers of these commands; discoverability must serve them, and every dependency must be declared
