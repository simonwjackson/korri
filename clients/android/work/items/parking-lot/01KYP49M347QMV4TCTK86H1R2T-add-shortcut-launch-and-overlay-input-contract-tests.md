---
id: 01KYP49M347QMV4TCTK86H1R2T
slug: add-shortcut-launch-and-overlay-input-contract-tests
title: Add shortcut-launch and overlay input contract tests
origin: parked
status: To Do
priority: medium
labels:
  - testing
  - shortcuts
  - input
  - korri
created: 2026-07-29
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/artemis
  branch: spike/korri-shell-webview
  commit: 3b81cf1514b1
  repo: artemis
  invoked_by: Tier-2 shipping review
---

# Add shortcut-launch and overlay input contract tests

## Why it matters

Tier-2 review found no automated coverage for ServerHelper/ShortcutTrampoline launch extras or the Guide/Xbox WebView overlay toggle. The current build and device activity smoke pass, but future changes could break these retained contracts while intent-constant tests remain green.

## Acceptance Criteria

- [ ] Tests exercise the real ServerHelper.createStartIntent path used by ShortcutTrampoline and assert retained shortcut/.art override extras and certificate/host identity data.
- [ ] Tests assert removed virtual-display and server-command extras are absent from produced Game intents.
- [ ] Behavioral coverage proves Guide/Xbox opens the overlay without forwarding Guide to the host when the menu setting is enabled and closes it when the WebView owns focus.
- [ ] Tests cover the intentional behavior when the in-game menu setting is disabled and document that L3+R3 is no longer an overlay shortcut.

## Related

- `app/src/main/java/com/limelight/utils/ServerHelper.java`
- `app/src/main/java/com/limelight/ShortcutTrampoline.java`
- `app/src/main/java/com/limelight/binding/input/ControllerHandler.java`
- `app/src/main/java/com/limelight/Game.java`
- `work/items/active/20260728-korri-dead-code-demolition/plan.md`
