---
id: task-034
title: Move Bun dependency cache policy out of flake.nix
status: To Do
priority: medium
labels:
  - nix
  - flake
  - bun
  - packaging
  - architecture
created: 2026-06-05
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  repo: simonwjackson/korri
  invoked_by: user
---

# Move Bun dependency cache policy out of flake.nix

## Why it matters

flake.nix currently owns dense Bun packaging policy: production-only dependency selection, generated bun.nix manifest loading, forbidden dev/test package patterns, the exact @proseql/core override key, the ProseQL codec patch, loud eval-time failure messages, and the pkgs.bun2nix.fetchBunDeps invocation. Moving this behind a dedicated tools/nix/bun-deps seam keeps the root flake focused on wiring outputs while colocating Bun cache invariants with the generation tooling that maintains them.

## Acceptance Criteria

- [ ] Add a dedicated Nix module for the Bun dependency cache contract, e.g. tools/nix/bun-deps/default.nix.
- [ ] Move the current flake.nix bunDeps policy into that module, including production package-name loading, forbidden production package pattern checks, the @proseql/core override key assertion, and the ProseQL codec patch override.
- [ ] Update flake.nix to import the Bun dependency module and pass the resulting bunDeps to package derivations without embedding the policy block inline.
- [ ] Preserve the existing just refresh-bun-deps workflow and generated files under tools/nix/generated/.
- [ ] Add or update a focused Nix check if practical so production cache invariants are tested near the Bun dependency module rather than only through downstream package builds.
- [ ] Run nix formatting and relevant flake/package checks that exercise Bun dependency cache evaluation.

## Related

- `flake.nix`
- `tools/nix/bun-production-deps.ts`
- `tools/nix/bun-production-deps.test.ts`
- `tools/nix/generated/bun.nix`
- `tools/nix/generated/bun-production-package-names.nix`
- `product/apps/portal/package.nix`
- `product/apps/cli/package.nix`
- `product/services/server/package.nix`
- `product/apps/desktop/nix/unwrapped.nix`

## Notes

This is the next flake.nix deepening opportunity after the product/device registry and desktop default.nix seam. Keep the interface small: ideally flake.nix imports one module and receives bunDeps, with any additional exposed metadata only if checks need it.
