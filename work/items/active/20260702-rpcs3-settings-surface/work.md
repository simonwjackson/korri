---
title: RPCS3 unified settings surface (all phases)
type: feat
status: active
date: 2026-07-02
---

# RPCS3 unified settings surface (all phases)

Give the `@korri:rpcs3` plugin a real, author-friendly settings surface: one
unified semantic settings tree under `settings.plugin` where the delivery
mechanism (CLI flag vs `config.yml` key vs GUI ini entry) is an internal
implementation detail, plus the settled `LaunchOverrides` raw escape hatch
(`overrides.args` / `overrides.config`) for anything not yet modeled.

Origin: `work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md`

## Progress

- Planned (see `plan.md`).
- **U0 spike resolved (source-grounded, RPCS3 `Emu/System.cpp`):** the
  `--config` materialization contract is now settled without needing the device.

## Implementation progress (/se-work)

Shipped Phase 0-2 as atomic commits on `feat/rpcs3-aka-source-plugin`
(not pushed, not integrated to trunk):

- **U0** — `--config` contract spike resolved from RPCS3 source (below).
- **U1** — release-scoped `overrides` folded onto the readable context +
  release-layer allowlist (strip content/state/firmware).
- **U2** — unified `Rpcs3Policy` strict Effect Schema.
- **U3** — delivery mapping table + router (ground-truth-verified strings).
- **U4/U5** — read-merge-canonical `config.yml` render + per-release write +
  `--config` argv assembly.
- **U6** — GUI popup-suppression preseed into CurrentSettings.ini.
- **U7** — command/env migration (XDG derivation) + README.
- **U8** — Phase 2 power-user tranche (renderer/backend/scale/shader/format/
  language/licenseArea).

Verification: `bun test product/plugins/rpcs3/src product/platform/library/config`
= 298 pass / 0 fail; biome clean; no new tsc errors in touched files.

**Deferred (in-plan, demand-driven, backlogged):** U9 (Phase 3 per-game
accuracy) and U10 (Phase 4 deep defaults/nested subtrees). Escape hatch
(`overrides.config`) covers their keys meanwhile.

## U0 findings — RPCS3 `--config` contract

Evidence: `RPCS3/rpcs3` `rpcs3/Emu/System.cpp` `Emulator::Load()` config-load
block (lines ~487-620, master; matches 0.0.41 behavior).

Load order in `cfg_mode::config_override`:
1. `g_cfg.from_default()` — every key reset to built-in defaults.
2. default renderer/adapter set; `g_cfg_defaults` cached.
3. `g_cfg.from_string(<--config file>)` — **merge overlay**: only keys present in
   the file are set; unspecified keys keep their default values.
4. The "Reload global configuration" block is **skipped** for `config_override`
   mode → the operator's global `config.yml` is **not** loaded.
5. `g_cfg.name = m_config_path` → any settings write-back targets the override
   file, never the operator's canonical `config.yml`.

Conclusions:
- **Partial `--config` is safe from "blank config"**: unspecified keys fall back
  to RPCS3 built-in defaults (not wiped).
- **But naive partial bypasses operator tuning**: in override mode the operator's
  global `config.yml` is ignored, so its hand-tuned keys are lost unless we carry
  them forward.
- **Chosen model: read-merge-canonical.** Read `<stateRoot>/config.yml` (operator
  canonical) if present, deep-merge routed settings + `overrides.config` over it,
  serialize **once** with the `yaml` package to
  `<stateRoot>/korri/config-<releaseId>.yml`, pass `--config` at that file.
  - Preserves operator tuning (R7 spirit) and leaves the canonical file
    untouched (R7 letter).
  - Serializing once eliminates the yaml-cpp duplicate-key hazard, so
    `overrides.config` is parsed + deep-merged, not blind string-appended
    (`replace` still wins whole-file).
  - Write-back risk is contained: RPCS3 only ever rewrites the disposable
    per-release override file, regenerated each launch.
- **Tooling:** `yaml` (`^2.8.0`, `eemeli/yaml`) is already a dependency
  (`product/platform/library/discovery/release-candidate-scan.ts:40`); use
  `parse`/`stringify` for render + merge instead of hand-rolled YAML text.
- **Deferred (non-blocking):** on-device confirmation on the Aka build that
  headless `--no-gui --config` honors the merged file and does not rewrite the
  operator's `config.yml`. Software model does not depend on this.
