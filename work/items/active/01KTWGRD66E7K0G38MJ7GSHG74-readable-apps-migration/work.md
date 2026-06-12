---
id: 01KTWGRD66E7K0G38MJ7GSHG74
slug: readable-apps-migration
title: Migrate readable library launch selection to apps[] app choices
status: active
priority: high
labels:
  - library-config
  - schema
  - cascade
  - migration
source: se-challenge-plan
created: 2026-06-11
---

# Migrate readable library launch selection to apps[] app choices

Generic, non-Steam prerequisite for Steam v1 (`01KTWFJXDKS8VYWPV94QTWCBEH`). Replace the
single scalar `release.app`/`release.runtime` launch selection with an `apps[]` app-choice
grammar (id-reference) on systems and releases, migrate fixtures/tests/examples, reject the
legacy fields, and delete the dead legacy `resolveLaunchContext` cascade while preserving the
live `resolveLocalLauncherPolicy` path and shared policy-merge primitives.

Scope decisions settled via se-challenge-plan:
1. App choices reference a top-level `apps.<id>` by `id`; `kind` is forbidden on a choice.
2. `apps[]` lands on both `systems.<id>` and `releases[]`.
3. `system.launch`/`system.launcher` are removed (system app selection comes from `system.apps[]`).
4. The dead `resolveLaunchContext` (GameRecord seven-layer cascade) is deleted; shared `fold*`
   primitives and the live `resolveLocalLauncherPolicy` are kept.
