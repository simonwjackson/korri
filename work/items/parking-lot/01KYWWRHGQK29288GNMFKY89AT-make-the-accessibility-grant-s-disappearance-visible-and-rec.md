---
id: 01KYWWRHGQK29288GNMFKY89AT
slug: make-the-accessibility-grant-s-disappearance-visible-and-rec
title: "Make the accessibility grant's disappearance visible and recoverable"
origin: parked
status: To Do
priority: high
labels:
  - android
  - overlay
  - accessibility
  - reliability
created: 2026-07-31
source: se-work
---

# Make the accessibility grant's disappearance visible and recoverable

## Why it matters

The Guide button and the whole global overlay depend on an accessibility grant that vanished four times in one session with no explanation established. When it goes, Guide stops opening Korri and the overlay stops existing — silently. No error, nothing in the UI, no way for a user to tell the difference between a broken feature and a revoked permission. An earlier theory that reinstalling revokes it was disproved when a later install left it intact, so the actual rule is still unknown. However well the overlay works while the grant is on, a feature that can switch itself off invisibly is not shippable, and this is now a larger risk than any behaviour still unmeasured.

## Acceptance Criteria

- [ ] Korri can tell whether the accessibility service is enabled and says so somewhere the user can see
- [ ] Pressing Guide with the grant missing leads the user to the grant rather than doing nothing
- [ ] The conditions under which the grant is revoked are established and written down
- [ ] Korri degrades rather than breaking when the service is absent

## Related

- `docs/research/guide-button-overlay.md`
- `docs/research/overlay-over-a-stream.md`
- `services/korrid/overlay-spike.sh`

## Notes

Known so far: writing enabled_accessibility_services or accessibility_enabled from adb clears the grant, and this session destroyed it twice that way before the spike script was changed to verify rather than set. One install kept the grant and another did not. Android 13+ restricted settings for sideloaded apps is a candidate explanation that has not been confirmed on this device.

Nothing in Korri asks for the grant, and Korri has no behaviour at all when it is absent — it simply does nothing when Guide is pressed.
