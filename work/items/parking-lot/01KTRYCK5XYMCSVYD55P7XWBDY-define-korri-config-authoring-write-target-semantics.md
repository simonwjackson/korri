---
id: 01KTRYCK5XYMCSVYD55P7XWBDY
slug: define-korri-config-authoring-write-target-semantics
title: Define Korri config authoring write-target semantics
origin: parked
status: To Do
priority: medium
labels:
  - config
  - authoring
  - cli
  - follow-up
created: 2026-06-10
source: se-challenge-plan
---

# Define Korri config authoring write-target semantics

## Why it matters

The new config-roots model intentionally treats config fragments as an ordered read graph, but CLI/import/editor flows still need an explicit, safe destination for creating or updating config without silently writing into arbitrary roots or removable media.

## Acceptance Criteria

- [ ] Define how create/update operations choose a target config root or file.
- [ ] Update authoring/import CLIs away from KORRI_LIBRARY_ROOT to the new config contract.
- [ ] Specify behavior when an existing record originated from a read-only or removable root.
- [ ] Add tests for explicit target selection and refusal/diagnostics when no writable target is provided.
- [ ] Document the authoring contract near the config-root implementation.

## Related

- `product/apps/cli/artifacts/artifact-import-command.ts`
- `tools/importers/rocknix/cli.ts`
- `tools/library/launcher-config-cli.ts`
- `product/platform/library/proseql/library-db.ts`
