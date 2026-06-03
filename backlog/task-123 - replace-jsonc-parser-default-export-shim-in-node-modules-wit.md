---
id: task-123
title: Replace jsonc-parser default-export shim in node_modules with a stable bundler config
status: To Do
priority: medium
labels:
  - build
  - deploy
  - evier
created: 2026-06-03
source: se-work
---

# Replace jsonc-parser default-export shim in node_modules with a stable bundler config

## Why it matters

The Evier deploy server bundle (`out/tmp/evier-deploy-server.js`) was unblocked by manually appending a `default` export to `node_modules/jsonc-parser/lib/esm/main.js` so bun's bundler stops choking on `@proseql/core`'s `import pkg from "jsonc-parser"`. Any `bun install` wipes the shim, which silently breaks the next rebuild. The right fix is upstream/proseql-side (`import * as pkg`) or a bun bundler config (loader / resolution override) that doesn't mutate node_modules.</why>
<parameter name="acceptance">["rebuilding `out/tmp/evier-deploy-server.js` from a clean `bun install` succeeds without manual node_modules edits", "either @proseql/core uses namespace import, or repo carries a documented bundler-side override"]

## Related

- `out/tmp/evier-deploy-server.ts`
- `node_modules/jsonc-parser/lib/esm/main.js`
- `node_modules/@proseql/core/dist/serializers/codecs/jsonc.js`
