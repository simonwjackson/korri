---
id: 01KVX1MRZVR38J3Z5T0WAEZ6EB
title: Host-agnostic Shift surface with a real seeded click-through
status: completed
created: 2026-06-23
source: user
---

# Host-agnostic Shift surface with a real seeded click-through

Make the Shift surface render and navigate identically in the design tool, a browser, and Electrobun by depending only on three host-supplied adapter ports — data, navigation, input — never on the environment. Stand up a real in-memory ProseQL seed so the design tool runs the actual engine + repository with no server/disk, and deliver a `home → game detail → Play` click-through whose launch lifecycle is represented (not executed). Decisions locked in session 2026-06-23; the in-memory ProseQL engine opener already landed in `92f88c98`.
