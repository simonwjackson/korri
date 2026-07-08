---
id: 01KX1E9A3WH9Y1WVZ4KT8C7C8W
title: fix: Make Ryubing plugin config generic and GUI-safe
status: active
created: 2026-07-08
source: direct
---

# fix: Make Ryubing plugin config generic and GUI-safe

Plan from the 2026-07-08 Bandai Ryubing investigation follow-up. The work turns
the verified debug path into a generic `@korri:ryubing` plugin contract: preserve
existing Ryujinx state by default, keep raw emulator config in the established
launch override escape hatch, and avoid device/user/path/controller-specific
product behavior. See `plan.md`.
