# Unified Android game overlay

- id: 01KYTRBJ7758KAZ56XHFE1C8BR
- status: active
- source: user request plus graduated overlay proof-of-concept backlog item
- origin: item.md
- target: Android first; shared contracts remain portable
- implementation: in progress on `feat/unified-android-game-overlay`

## Execution decisions

- korrid creates `launchId` during route/session preparation and carries resolved launch context through signed local and Moonlight handoffs.
- korrid publishes typed Moonlight availability; portal checks it before native discovery/start through the existing bundled default policy.
- Choice/range rows remain in navigation mode: Up/Down moves rows, Left/Right changes values, held repeat applies only to ranges, Confirm invokes command/toggle controls, and Back closes the sheet.
- RetroArch menu control waits for authenticated acknowledgement, dismisses on success, and leaves the sheet open with readable failure otherwise.
- Recreated Artemis activities use process-local object-identity compare-and-clear under the serialized `launchId`.
- The overlay WebView uses the asset-loader HTTPS origin, CSP/subresource restrictions, disabled file/content access, and a narrow bridge.

## Tasks

- [ ] U1: Define gameplay-overlay treaties (contract/pure-model TDD).
- [ ] U2: Add plugin-declared session controls and resolution (registry TDD).
- [ ] U3: Declare Moonlight plugin ownership (cross-layer ATDD).
- [ ] U4: Track active Android launches and service scoping (characterization, then state-machine TDD).
- [ ] U5: Render the unified Shift side sheet (surface ATDD before Android host).
- [ ] U6: Move all Moonlight gameplay controls behind the global overlay (characterization-first parity slices).
- [ ] U7: Add the authenticated RetroArch native-menu action (protocol TDD).
- [ ] U8: Cut over only after repository and installed-device gates pass.
- [ ] Review the complete diff and resolve relevant residual findings.
- [ ] Run `nix run .#check` and mandatory device acceptance.
- [ ] Integrate locally and close the graduated backlog item.

## Installed-device evidence

### 2026-08-06 — local RetroArch gate passed

`proc_177` completed successfully on the RG405M at
`100.69.171.11:5555` (exact model `TrebleDroid vanilla`, hardware serial
`13584945524322`). The single action-bounded run proved:

- physical Guide opened the global Shift gameplay sheet over local Wario;
- the attached overlay accepted physical controller navigation immediately,
  without first touching the WebView;
- physical Shift **Open RetroArch menu** produced authenticated native-menu
  state;
- native physical Down moved exactly one row, then physical Up plus A selected
  **Resume** and closed the native menu;
- physical Shift **Resume** returned to gameplay;
- pause refreshed the auto-state, authenticated acknowledged Quit retired the
  first exact launch, and installed-UI relaunch successfully auto-loaded it;
- final physical Shift **Quit game** acknowledged, tore down RetroArch, and made
  the old controls and invocation stale;
- cleanup restored `library.yaml` to
  `696019a567bd1a38ba41c96bf193cb051a06fb6bf39dd8bfbf51cae810336d64`,
  left no owned lock/backup or RetroArch PID, and preserved the enabled
  `com.simonwjackson.korri.debug/com.limelight.korri.overlay.KorriOverlayService`.

The brief blank/reappear transition observed before the sheet slide remains a
pending UX investigation. Abrupt force-stop/crash retirement is not claimed;
it is deferred to `01KZBYHCA4R9C8QK131HK0VWSA`. Moonlight parity and U8
cutover remain pending, so the legacy overlay files stay in place.
