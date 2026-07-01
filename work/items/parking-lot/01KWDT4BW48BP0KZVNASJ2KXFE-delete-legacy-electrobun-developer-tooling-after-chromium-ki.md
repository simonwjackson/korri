---
id: 01KWDT4BW48BP0KZVNASJ2KXFE
slug: delete-legacy-electrobun-developer-tooling-after-chromium-ki
title: Delete legacy Electrobun developer tooling after Chromium kiosk cutover
origin: parked
status: To Do
priority: high
labels:
  - chromium-kiosk
  - electrobun-removal
  - cleanup
created: 2026-07-01
source: se-work
context:
  branch: trunk
  commit: 1b46b5a3
  repo: korri
---

# Delete legacy Electrobun developer tooling after Chromium kiosk cutover

## Why it matters

The runtime baseline now uses Chromium + the web-surface host, but historical Electrobun packaging/dev tools and dependency artifacts still remain. Leaving them around can confuse future work and keeps Electrobun in the production dependency closure even though sessiond no longer uses it by default.

## Acceptance Criteria

- [ ] `git grep -i electrobun` outside historical docs/work items returns no active runtime, tooling, package, or test references.
- [ ] `package.json`, `bun.lock`, and generated Nix bun dependency files no longer include the Electrobun npm package.
- [ ] Legacy desktop/electrobun just recipes, tools, proof-smoke utilities, and Nix package outputs are removed or renamed to Chromium equivalents.
- [ ] Kiosk image/package evals and focused renderer/input tests remain green after the removal.

## Related

- `electrobun.config.ts`
- `package.json`
- `bun.lock`
- `tools/desktop/`
- `tools/device/electrobun-proof-smoke.ts`
- `product/apps/desktop/nix/`
- `product/services/device/sessiond-electrobun.ts`
- `work/items/active/01KWE3F5Q2ZK8N4YT7VBQ3MJ9A-replace-electrobun-chromium-kiosk/plan.md`
