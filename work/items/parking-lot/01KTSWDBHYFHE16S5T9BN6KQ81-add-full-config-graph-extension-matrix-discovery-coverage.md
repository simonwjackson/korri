---
id: 01KTSWDBHYFHE16S5T9BN6KQ81
slug: add-full-config-graph-extension-matrix-discovery-coverage
title: Add full config-graph extension-matrix discovery coverage
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-06-10
source: se-work
---

# Add full config-graph extension-matrix discovery coverage

## Why it matters

U1 covers YAML+JSON cross-format parity and asserts every KORRI_CONFIG_EXTENSIONS entry is present in the include globs (drift guard), but there is no per-codec discovery/decoding test for ndjson/jsonl/json5/jsonc/toml/toon/hjson/prose. A focused matrix test would prove each registered codec actually decodes a korri fragment into identical runtime records and that an unsupported extension is excluded.

## Related

- `product/platform/library/proseql/config-graph-db.test.ts`
- `product/platform/library/proseql/library-db.ts`
