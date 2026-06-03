---
id: task-124
title: Wire the Evier dev server start-up into a repo script (replace ad-hoc /tmp/start-evier.sh + systemd-run)
status: To Do
priority: low
labels:
  - deploy
  - evier
  - ops
created: 2026-06-03
source: se-work
---

# Wire the Evier dev server start-up into a repo script (replace ad-hoc /tmp/start-evier.sh + systemd-run)

## Why it matters

The current deploy/restart of `evier-deploy-server.js` on Bandai is a hand-rolled bash recipe living in `/tmp/start-evier.sh`, launched via `systemd-run --unit=evier-deploy --collect`. SSH disconnect kills `nohup setsid` variants but not the transient systemd unit, which is why this works today — but the unit definition, env var set, and PID tracking are not in version control. Any session rebuilding this from scratch has to re-derive it.</why>
<parameter name="acceptance">["a checked-in script (e.g. `tools/scripts/evier-deploy-bandai.ts` or a Nix module) starts/restarts the Evier dev server with the same env contract", "the script either declares a systemd unit or uses a guaranteed-detached supervisor", "docs/handoffs reference the script instead of inline ssh recipes"]

## Related

- `out/tmp/evier-deploy-server.ts`
- `out/tmp/evier-deploy-server.js`
