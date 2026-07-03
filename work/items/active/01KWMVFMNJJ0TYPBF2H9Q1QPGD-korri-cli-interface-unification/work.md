---
id: 01KWMVFMNJJ0TYPBF2H9Q1QPGD
slug: korri-cli-interface-unification
title: "refactor: Unify the korri-cli surface and exit-code contract"
type: refactor
status: active
created: 2026-07-03
---

# korri-cli interface unification

Durable refactor of the `korri` command-line surface. Collapses transport-specific
verbs into one `launch`, unifies `--host`, adopts prompt-on-ambiguity, moves
confirmation onto consequence (not verb), and replaces three competing exit-code
schemes with one canonical table.

Design was settled collaboratively in-session before planning. See `plan.md`.
