---
id: 01KWN2A0P7Q3R5S8T0V2W4X6YZ
slug: plugins-catalog-split
title: "refactor: make product/plugins a pure plugin catalog"
status: active
created: 2026-07-03
---

# refactor: make product/plugins a pure plugin catalog

Treat `product/plugins/` as if it were a separate repository: it should contain
only plugin folders. The non-plugin top-level files (host wiring, the shared
community-source authoring helper, and two plugins-as-loose-files) move to
logical homes.

Origin: direct user request. See `plan.md`.
