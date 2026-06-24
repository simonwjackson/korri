---
id: 01KVXCYHNPPZY9FAQDS26CX70W
slug: gmloader-path-run-cache
title: Add nix-run-like GMLoader path launch caching
status: active
created: 2026-06-24
source: se-plan
priority: high
labels:
  - gmloader
  - launch
  - materialization
  - cache
context:
  repo: simonwjackson/korri
  cwd: .
  invoked_by: se-plan
---

# Add nix-run-like GMLoader path launch caching

Plan direct local APK/path launches for `@korri:gmloader` so first launch materializes a normalized cache and future launches reuse it.
