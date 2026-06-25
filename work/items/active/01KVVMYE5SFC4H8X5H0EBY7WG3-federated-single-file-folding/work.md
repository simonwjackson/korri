---
title: Federated release folding by exact identifier
status: active
type: feat
date: 2026-06-23
source: direct-prompt
---

# Federated release folding by exact identifier

Plan exact-identifier folding for the federated Korri catalog: a release carries an exact tag (single-file content hash or provider-ref native id) as identity metadata, publishes it, and same-tag releases across storages fold into one user-facing item — preferring a locally launchable copy, falling back to remote streaming, and exposing an availability signal. Internal ids are never a match key. Format-normalized/multi-file hashing and the signaling/curation tiers are deferred.
