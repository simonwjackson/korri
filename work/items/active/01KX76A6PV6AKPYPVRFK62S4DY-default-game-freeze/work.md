# Default game freeze — metadata

- **Id:** 01KX76A6PV6AKPYPVRFK62S4DY
- **Slug:** default-game-freeze
- **Created:** 2026-07-10
- **Origin:** graduated from `work/items/parking-lot/` (see `item.md`)
- **Absorbs:** `01KX75XAWDVGPD7XW4V7MJ55EK` (expose managed-launch freeze/thaw through Effect RPC) — implemented as U1 of `plan.md`
- **Related (not absorbed):** `01KX6M0HJK6AJCF7JC9XVKAZBH` (cgroup v2/systemd-scope freeze hardening) — stays parked
- **Builds on:** commit `ee2bf514` — `feat(sessiond): add managed launch freeze cycle`
- **Artifacts:**
  - `item.md` — graduated parking-lot capture
  - `plan.md` — implementation plan (status: completed)
- **Status note (2026-07-10):** All 7 implementation units plus Tier 2 review fixes landed on trunk (`5643856a..dc67be01`). Remaining: deploy to aka (push + mountainous flake bump) and the on-device acceptance run from `item.md` (hard network cut, lid close/open cycle, ≥1h freeze soak).
