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
