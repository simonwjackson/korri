---
id: 01KWGJZ7DDV2S9YH9ST6ZXTS0K
slug: steam-installed-app-discovery
title: Steam installed-app discovery provider
status: completed
priority: high
labels:
  - plugins
  - discovery
  - scanner
  - steam
created: 2026-07-02
source: se-plan
---

# Steam installed-app discovery provider

Plan the next plugin-owned discovery slice: the Steam plugin reads locally installed Steam app manifest/state from the configured Steam state root, emits provider-ref candidate observations, and Korri reconciles/dedupes/persists readable-library entries.
