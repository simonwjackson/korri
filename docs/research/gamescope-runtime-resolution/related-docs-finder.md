### Inventory summary

- Total docs in `docs/solutions/` scanned: 38 markdown files across 8 subdirectories (architecture-patterns, best-practices, build-errors, design-patterns, integration-issues, runtime-errors, ui-bugs, workflow-issues).
- Pre-filter: parallel case-insensitive ripgrep across full body for `steam | gamescope | sway | xwayland | launcher | kiosk | compositor | libX11 | pressure-vessel | rocknix | sniper | proton`, then narrowed to entries that actually carried Steam/gamescope/xwayland substance.
- Surfaced candidates: 8 (then frontmatter-read in full); full-body read for the 3 strong/moderate matches and 3 adjacent context docs.
- Also scanned `docs/acceptance/` for the just-landed acceptance notes referenced in git status (`steam-manual-launch-x86-aka-2026-05-26.md`, `steam-runtime-capsule-refactor-sobo-2026-05-23.md`).
- No standalone "nix overlay / package pinning" or "D-Bus readiness probe" learning exists in `docs/solutions/`; the new finding is greenfield on those axes.

### Strong/moderate matches

- path: docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md
  - overlap score: high
  - matched dimensions: problem statement, root cause, solution approach, referenced files (AppID 2379780, SteamLinuxRuntime_sniper, GE-Proton, Sway/Gamescope launch shape), prevention rules (Steam Runtime envelope is mandatory; nested Gamescope under Sway; PROTON_USE_XALIA=0)
  - recommendation: CREATE+flag-for-consolidation (lean toward an eventual UPDATE/rename that drops the "ARM64" framing)
  - relationship summary: This is the direct predecessor learning. The new x86/aka work proves the same SteamLinuxRuntime_sniper -> Proton -> Sway/Gamescope pattern generalizes off ARM64, swapping FEX/Box64/`steamrtarm64`/ARM64-manifest scaffolding for the NixOS `steam-run` FHS envelope, and replacing the pgrep "is Steam up?" pattern with a D-Bus probe on `com.steampowered.PressureVessel.LaunchAlongsideSteam`. The two docs should be cross-linked immediately; the rocknix doc's title and "When to Apply" make it look arm64-specific, so a follow-up consolidation pass (or a shared parent doc + arch-specific addenda) is warranted.

- path: docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md
  - overlap score: moderate
  - matched dimensions: referenced components (sway, gamescope, korri-kiosk, x86 platform module), prevention rules (compositor invariants belong to session policy; Gamescope is an adapter, not the universal overlay)
  - recommendation: CREATE+cross-link
  - relationship summary: Same compositor area (sway + gamescope under korri-compositor) but a different concern. That doc argues *who* owns foreground policy; the new finding pins *which versions* of sway/gamescope are needed and *how* to gate Steam launches on D-Bus readiness. New doc should cite this as the architectural backdrop and note that compositor-version pinning is upstream of foreground policy: nested gamescope under sway has to not crash before any policy matters.

- path: docs/solutions/runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md
  - overlap score: moderate (low–moderate; tightly scoped to ARM64 prerequisite)
  - matched dimensions: solution approach (Steam desktop UI under Sway as the context for manual launch), referenced files (steamrtarm64, steamwebhelper, AppID flow), Sway/runtime-dir env scaffolding
  - recommendation: CREATE+cross-link
  - relationship summary: This is the ARM64-only prerequisite the rocknix manual-launch doc depends on. The new x86 finding deliberately bypasses it (no ARM64 client manifest to repair on x86), so the cross-link should explicitly mark this as "ARM64-only precondition; not required on x86".

### Refresh candidates

- docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md — title and `applies_when` imply the technique is ARM64-specific; the new x86 result disproves that. Either retitle to drop "rocknix-arm64", split the truly ARM64-only bits (FEX/Box64, steamrtarm64, ARM64 manifest, GE-Proton aarch64 caveats) into a clearly-scoped section, or add a "Cross-arch validation" callout linking the x86 learning. Also: this doc relies on `pgrep`-shaped readiness signals throughout the diagnostics ("ps | grep steamwebhelper"); a forward reference to the D-Bus `com.steampowered.PressureVessel.LaunchAlongsideSteam` probe would be a meaningful upgrade.
- docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md — Not stale, but its `related_components` list and "When to Apply" should pick up the korri-compositor overlay pattern (sway 1.12 + gamescope 3.16.23 pinning) as a concrete example of why "Gamescope as adapter" needs version coherence to even start; otherwise the foreground policy is moot.
- No standalone "Steam readiness" or "compositor version pinning" doc exists today; the new finding is the first capture of either.

### GitHub issues

gh unavailable / no matches (`gh` CLI not on PATH in this env; cannot search the issue tracker).

### Cross-references to include in new doc

1. docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md — the ARM64 sibling; explicitly frame the new doc as "x86/AKA mirror" and note what is *not* needed (FEX, Box64, steamrtarm64, ARM64 manifest repair, /host/lib overlay).
2. docs/solutions/runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md — ARM64-only precondition for the sibling; not required on x86 because NixOS `steam-run` provides the bootstrap envelope.
3. docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md — compositor-policy backdrop; nested-gamescope-under-sway must not crash before any foreground policy is meaningful, so the korri-compositor overlay pinning is a prerequisite to that pattern.
4. docs/acceptance/steam-manual-launch-x86-aka-2026-05-26.md — companion acceptance evidence (attempts 1–3, environment, exact command shape that worked on `aka`).
5. docs/acceptance/steam-runtime-capsule-refactor-sobo-2026-05-23.md — adjacent Steam runtime capsule work (`packages/steam/`) on Sobo; the x86 finding reinforces the capsule's reusable-helpers vs. substrate-adapter split by being the second arch consumer of the same shape.
