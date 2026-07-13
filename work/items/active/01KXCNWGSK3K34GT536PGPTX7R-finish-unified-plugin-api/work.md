---
id: 01KXCNWGSK3K34GT536PGPTX7R
slug: finish-unified-plugin-api
title: Finish the unified plugin API (one capable HTTP surface, no bundled bypass)
status: active
type: feat
created: 2026-07-12
source: user
related:
  - work/items/parking-lot/01KXC8EAAD647X5PBTYMP06T6E-enable-rom-site-downloads-via-plugin-http-capability-additio.md
  - work/items/active/20260703-plugin-ecosystem-api/plan.md
---

# Finish the unified plugin API

Make `context.services.http` a real HTTP client (method/body, binary, response
status/headers, per-provider cookie jar) so bundled first-party, local
operator-installed, and future third-party plugins all use the same API — then
delete itchio's `fetchImpl ?? fetch` bypass so the bundled reference plugin
dogfoods the unified surface. Motivated by the ROM-site download gaps captured
in 01KXC8EA; that item becomes the end-to-end acceptance driver.

See `plan.md`.
