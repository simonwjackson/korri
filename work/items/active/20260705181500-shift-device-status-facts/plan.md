---
title: feat: Present real Shift battery and network facts
type: feat
status: active
date: 2026-07-05
verify_command: "just test-unit && just typecheck"
---

# feat: Present real Shift battery and network facts

## Summary

Extend the existing Korrid device-state pipeline so Shift receives real battery and network connection facts through the platform bridge instead of surface-owned defaults. Shift keeps its status-bar components pure and prop-driven, while the production entrypoint presents live device state through atoms and the battery UI gains an optional percentage label.

---

## Problem Frame

Shift currently has the shape of a device-aware status bar, but production does not actually feed its battery or network readings from the mounted surface bridge. Battery data exists server-side, network data does not yet exist as a platform fact, and Shift's network atom defaults to a fake connected state; the result is a status bar that can look correct in the lab while production remains stale, hidden, or synthetic.

---

## Requirements

- R1. Shift status UI must receive battery and network facts through platform/device-state presentation seams, not by probing browser, Linux, sysfs, or daemon data inside visual components.
- R2. Production Shift must subscribe to the existing current-state-first device bridge and feed `deviceStateAtom` so battery changes reach the route through the same atom the lab already drives.
- R3. Network connection status must become a real device-state fact with a device-agnostic Linux floor: connected/disconnected/unknown and best-effort Wi-Fi strength when available.
- R4. Shift's live network display must derive from real `DeviceState` in production and must not render the current fake connected default when device state is unknown.
- R5. Battery display must optionally include a percentage label without forcing every existing fixture/status-bar composition to show numeric text.
- R6. The lab/design-tool seams must continue to drive battery and network through atoms/events and must capture the same live values that the mounted route displays.
- R7. Error, missing-hardware, domain stale/read-error, and bridge-absent cases must degrade explicitly rather than masquerading as fresh connected or charged data. Client-side transport staleness beyond browser `EventSource` retry behavior is deferred.

---

## Scope Boundaries

- Shift is the only surface in scope; Pico, Evier, Vigie, and Boxbuster are not updated here.
- The active network provider is the universal Linux floor: `/sys/class/net` plus `/proc/net/wireless` where available. NetworkManager, ConnMan, D-Bus, `iw`, and `ip monitor link` enhancements are deferred.
- This plan does not add a diagnostics panel, settings screen, or user-facing network details beyond the Shift status-bar connection indicator.
- This plan does not redesign the status bar; it adds enough rendering support for optional battery percentage and truthful network states.
- This plan does not replace the existing `/api/device/events` stream or `KorriPlatformBridge.device` contract; it extends the payload and uses the existing bridge shape.

### Deferred to Follow-Up Work

- NetworkManager/ConnMan adapters: add richer connectivity and SSID data when a second source is needed beyond the sysfs floor.
- Event-driven network changes through rtnetlink or `ip monitor link`: defer until sub-10-second network transition latency matters.
- Cross-surface adoption: adapt Pico/Evier/Vigie after Shift proves the extended device-state model and UI mapping.
- Client-side SSE staleness/reconnect hardening: browser `EventSource` auto-reconnect is accepted for this slice; explicit stale transport indication belongs in a separate reliability pass.

---

## Context & Research

### Relevant Code and Patterns

- `work/items/active/20260701154000-device-state-events/plan.md` established the completed device-state foundation: Korrid owns normalized device facts, exposes snapshot RPC, and streams current-state-first changes.
- `docs/solutions/architecture-patterns/korrid-device-state-subscriptionref-2026-07-01.md` documents the `SubscriptionRef<DeviceState>` current-state-first architecture and the rule that surfaces do not own second authoritative readers.
- `product/apps/portal/api/device/device-state.ts` owns the live `DeviceStateService`; it currently reads battery only and emits `device.state` changes.
- `product/platform/device/device-facts.ts` defines the `DeviceState` schema and battery ADT; network should extend this schema rather than invent a Shift-only contract.
- `product/apps/portal/platform-bridge.ts` already exposes `KorriPlatformBridge.device.status/refresh/subscribe` and subscribes to `/api/device/events`.
- `product/surfaces/web/shift/entry.tsx` is the production Shift composition root; it already mounts runtime chrome and recently gained `ShiftClockBridge` as the bridge pattern to mirror.
- `product/surfaces/web/shift/ShiftClockBridge.tsx` shows the non-rendering bridge shape: inject source, subscribe in an effect, write an atom, render `null`.
- `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx` currently reads `deviceStateAtom` for battery display but reads `shiftNetworkReadingAtom` for network display and reads `shiftPowerReadingAtom` for live-coordinate capture.
- `product/surfaces/web/shift/shift-power-state.ts` contains the pure `DeviceState` → Shift power display derivation and is the right place to thread percentage display props.
- `product/surfaces/web/shift/shift-network-state.ts` contains the current fixture/lab network reading model; it needs a device-state derivation so live display is not backed by the default atom.
- `tools/theme-workshop/lab/adapters/shift-edges.ts` and `tools/theme-workshop/lab/seed/shift-seed.ts` already write battery-oriented device facts into `deviceStateAtom`; lab behavior should continue through that production derivation path.

### Institutional Learnings

- `docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md`: lab parts must seed real upstream atoms and flow through production derivation, not hand-set rendered props.
- `docs/solutions/architecture-patterns/pico-parts-are-the-app-2026-07-02.md`: Pico's status bar is a close analogue for deriving power/network props from atom state through a live composing host.
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`: long-lived streams need heartbeat/no-timeout discipline; this plan does not modify transport, but it must not interpret transport liveness as device-domain state.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`: convert runtime/device state into domain ADTs at the seam; do not branch on raw async/runtime primitives in JSX.
- `docs/solutions/best-practices/derive-component-states-from-state-machines-2026-06-25.md`: enumerable display states should be modeled once and reused by tests/lab fixtures rather than copied into hand-written lists.

### External References

- Linux kernel operstate docs: https://docs.kernel.org/networking/operstates.html
- Linux sysfs net ABI: https://www.kernel.org/doc/Documentation/ABI/testing/sysfs-class-net
- `/proc/net/wireless` format and caveats from Linux wireless extensions documentation and common kernel ABI behavior.
- NetworkManager and ConnMan documentation were reviewed as richer future adapters; both are intentionally not first-slice dependencies because they are not guaranteed across Korri targets.

---

## Key Technical Decisions

- Extend `DeviceState` with a `network` fact instead of adding a Shift-only network source: battery and network are both device facts, and the user explicitly wants data presented through a shared engine rather than obtained by the surface.
- Use sysfs as the first network provider: `/sys/class/net` is the portable Linux floor, requires no extra daemon dependency, and matches the existing power-supply reader's testable file-system pattern.
- Treat Wi-Fi strength as best-effort: `/proc/net/wireless` may provide live signal data for Wi-Fi, but lack of signal data should still allow a connected/disconnected reading.
- Keep `KorriPlatformBridge.device` current-state-first and do not add a separate Shift status call before subscribe: the existing device stream is designed to deliver current state first; separate snapshot calls can race and overwrite newer streamed state.
- Add a Shift runtime bridge for device state, not a data read inside the route or status bar: `entry.tsx` owns source wiring; components consume atoms/props.
- Derive live Shift network display from `deviceStateAtom`, not from the surface default `shiftNetworkReadingAtom`: the default remains useful for fixture/catalog rendering, but production must not display fake connectivity.
- Battery percentage is opt-in by prop/data presence, not a global visual default: existing fixture/status-bar compositions keep their current icon-only look unless the composing host passes percentage data.
- Stale battery should not be presented as fresh: the first implementation keeps the current conservative behavior of hiding stale battery props unless a future design explicitly adds a stale visual treatment.

---

## Open Questions

### Resolved During Planning

- Where does real network data come from? Resolution: extend `DeviceState` with a network ADT and implement a sysfs/procfs network reader as the universal first provider.
- Should Shift call browser APIs such as `navigator.onLine`? Resolution: no. That would make the surface/browser own a second data path and would not provide device-agnostic daemon truth.
- Should the Shift bridge call `device.status()` before subscribing? Resolution: no for this slice. The device-event stream is current-state-first; a separate snapshot introduces a race already avoided by the prior `DeviceFactsSubscriptionBridge` pattern.
- Should battery percentage always render? Resolution: no. Percentage is available in the props chain only when the composing host opts into passing it.
- Should stale battery render last-known percentage? Resolution: no for this plan. Preserve the current safety rule that stale data is not shown as fresh.
- What should device refresh report after network joins battery? Resolution: use a multi-fact refresh acknowledgement rather than a battery-only result; the UI still updates only through the device-state store/events.
- How should multiple network interfaces resolve to one status-bar reading? Resolution: explicit interface override wins; otherwise filter loopback/virtual devices, derive aggregate connectivity from any usable connected physical interface, prefer connected Wi-Fi for representative signal, fall back to connected Ethernet, then unknown when no reliable physical interface can be classified.
- How should network degraded states render? Resolution: connected renders the Wi-Fi/network icon with a strength-aware accessible label when strength exists; disconnected renders the disconnected icon; unknown/read-error/bridge-absent render no fake connected state and expose an explicit non-connected capture value for the design tool.

### Deferred to Implementation

- Exact CSS placement for the battery percent label: keep it inside the existing status cluster/battery atom; choose the smallest token-aligned styling during implementation.
- Exact implementation helper boundaries for interface selection: the policy is planned, but the smallest helper decomposition can be chosen during implementation.
- Exact procfs wireless parser shape: keep it small and pure; implementation can tune parsing once fixture coverage exists.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  BatterySysfs[/sys/class/power_supply/] --> BatteryReader[Existing battery reader]
  NetSysfs[/sys/class/net/ + /proc/net/wireless] --> NetworkReader[New network reader]
  BatteryReader --> DeviceStateService[DeviceStateService refresh path]
  NetworkReader --> DeviceStateService
  DeviceStateService --> DeviceRef[SubscriptionRef<DeviceState>]
  DeviceRef --> DeviceStatus[app.device.status]
  DeviceRef --> DeviceEvents[/api/device/events current-state-first]
  DeviceEvents --> PlatformBridge[KorriPlatformBridge.device.subscribe]
  PlatformBridge --> ShiftDeviceBridge[ShiftDeviceBridge in entry.tsx]
  ShiftDeviceBridge --> DeviceAtom[deviceStateAtom]
  DeviceAtom --> ShiftPower[shiftPowerDisplayForDeviceState]
  DeviceAtom --> ShiftNetwork[shiftNetworkDisplayForDeviceState]
  ShiftPower --> ShiftStatus[ShiftStatusBar props]
  ShiftNetwork --> ShiftStatus
  ShiftStatus --> User[Shift status bar]
```

The central rule is that producers update `DeviceStateService`, the bridge presents `DeviceState` to the Shift atom registry, and Shift visual components render derived props. No Shift atom/molecule/organism probes device APIs directly.

---

## Implementation Units

### U1. Extend device facts with network state

**Goal:** Add a canonical, schema-backed network fact to `DeviceState` so network is represented as platform/device truth rather than a surface-local default.

**Requirements:** R1, R3, R4, R7

**Dependencies:** None

**Files:**
- Modify: `product/platform/device/device-facts.ts`
- Modify: `product/platform/device/device-facts.test.ts`
- Modify: `product/apps/portal/api/device/events.rpc.ts`
- Modify: `product/apps/portal/api/device/status.rpc.ts`
- Modify: `product/apps/portal/api/device/refresh.rpc.ts`
- Modify: `product/apps/portal/api/device/refresh.rpc-handler.ts`
- Modify: `product/apps/portal/api/device/refresh.rpc-handler.test.ts`
- Modify: `product/apps/portal/platform-bridge.ts`
- Modify: `product/apps/portal/platform-bridge.test.ts`

**Approach:**
- Add a `DeviceNetworkState` discriminated union alongside the existing battery union. It should represent at minimum unknown, connected, disconnected, stale/read-error as needed by the provider and UI.
- Include enough connected data to support Shift's current model: connection kind when knowable and strength percent when available.
- Update `DeviceStateSchema`, `unknownDeviceState`, equality comparison, event payloads, status responses, refresh acknowledgements, and bridge response guards so network rides the existing device-state event and RPC contracts.
- Preserve backward-looking safety in tests by asserting that timestamp-only changes still do not count as fact changes.

**Execution note:** Implement the schema/normalization tests first; all later units depend on a stable domain shape.

**Patterns to follow:**
- `product/platform/device/device-facts.ts` battery ADT and `normalizeBatterySnapshot`.
- `product/platform/device/device-facts.test.ts` battery normalization and equality tests.
- `product/apps/portal/api/device/events.rpc.ts` for schema-backed event serialization.

**Test scenarios:**
- Happy path: a connected Wi-Fi snapshot with signal maps to a network connected state carrying normalized strength.
- Happy path: a disconnected interface maps to a disconnected network state, not a read error.
- Edge case: unknown/unsupported interface state maps to unknown rather than fake connected.
- Edge case: strength values outside 0-100 are clamped or omitted consistently.
- Error path: a read failure after no known network value maps to read-error/unknown according to the chosen ADT.
- Integration: `DeviceStateSchema` accepts a state with both battery and network and rejects malformed network payloads.

**Verification:**
- Device-state schema, event, and status payloads carry network facts without changing the public bridge method shape.

---

### U2. Add a testable Linux network reader and integrate it into DeviceStateService

**Goal:** Populate `DeviceState.network` from a device-agnostic Linux source using the same current-state-plus-changes pipeline that already feeds battery.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U1

**Files:**
- Create: `product/apps/portal/api/device/device-network-reader.ts`
- Create: `product/apps/portal/api/device/device-network-reader.test.ts`
- Modify: `product/apps/portal/api/device/device-state.ts`
- Modify: `product/apps/portal/api/device/device-state.test.ts`
- Modify: `product/apps/portal/api/device/status.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/device/events.rpc-handler.test.ts`

**Approach:**
- Implement a real reader with injectable filesystem dependencies and configurable roots/explicit interface override, mirroring the existing power-supply reader's test posture.
- Use `/sys/class/net` as the universal source for interface enumeration, operstate, carrier, and Wi-Fi-vs-wired detection.
- Use `/proc/net/wireless` only as a best-effort Wi-Fi signal enrichment; absence of wireless stats must not block connected/disconnected status.
- Apply a deterministic representative-interface policy: explicit override first; otherwise ignore loopback/virtual devices, aggregate connectivity from any usable physical interface, prefer connected Wi-Fi for status-bar signal, fall back to connected Ethernet, and emit unknown when no reliable physical interface can be classified.
- Integrate the reader into `DeviceStateService.refresh` so battery and network are observed in the same serialized refresh path and emitted as one `DeviceState` value.
- Keep manual refresh and background polling routed through the same reducer/store path; refresh responses acknowledge the observed fact set but UI changes still arrive through `device.state`.

**Execution note:** Characterize the current battery-only refresh behavior before changing the service so existing battery stale/read-error semantics do not regress.

**Patterns to follow:**
- `product/apps/portal/api/stream-control/device-control-service.ts` dependency-injected filesystem reader shape.
- `product/apps/portal/api/device/device-state.ts` serialized refresh tail and `SubscriptionRef` state store.
- `work/items/active/20260701154000-device-state-events/plan.md` for the current-state-first device-state architecture.

**Test scenarios:**
- Happy path: one physical Wi-Fi interface with `operstate=up` and wireless stats produces connected network state with strength percent.
- Happy path: one Ethernet interface with carrier/operstate up produces connected network state without Wi-Fi strength.
- Edge case: loopback and virtual interfaces are ignored during interface selection.
- Edge case: explicit interface override chooses that interface even when other candidates exist.
- Edge case: `operstate=unknown` plus readable carrier is treated conservatively rather than fake-disconnected.
- Error path: missing `/sys/class/net` or unreadable selected interface produces typed read-error/unknown without throwing out of the device-state stream.
- Integration: a battery change and a network change both produce a single `DeviceState` payload consumed by `app.device.status` and `/api/device/events`.
- Integration: unchanged network/battery facts do not emit duplicate state solely because `observedAt` changed.

**Verification:**
- Device-state refresh produces network facts in snapshots and live events while retaining existing battery behavior.

---

### U3. Present live device state to Shift and derive real network display

**Goal:** Wire production Shift to the existing device bridge so battery and network display derive from live `deviceStateAtom`, while lab/fixture atoms remain controlled by their existing seams.

**Requirements:** R1, R2, R4, R6, R7

**Dependencies:** U1, U2

**Files:**
- Create: `product/surfaces/web/shift/ShiftDeviceBridge.tsx`
- Create: `product/surfaces/web/shift/ShiftDeviceBridge.test.tsx`
- Modify: `product/surfaces/web/shift/entry.tsx`
- Modify: `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`
- Modify: `product/surfaces/web/shift/shift-network-state.ts`
- Create or modify: `product/surfaces/web/shift/shift-network-state.test.ts`
- Modify: `product/surfaces/web/shift/ui/atoms/ShiftNetworkIcon.tsx`
- Create or modify: `product/surfaces/web/shift/ui/atoms/ShiftNetworkIcon.test.tsx`
- Modify: `product/surfaces/web/shift/ui/molecules/ShiftStatusBar.tsx`
- Create or modify: `product/surfaces/web/shift/ui/molecules/ShiftStatusBar.test.tsx`
- Modify: `product/surfaces/web/shift/shift-current-coordinate.ts`
- Modify: `product/surfaces/web/shift/shift-current-coordinate.test.ts`

**Approach:**
- Add a non-rendering `ShiftDeviceBridge` modeled after `ShiftClockBridge`: it accepts the optional bridge device capability, subscribes current-state-first, writes `deviceStateAtom`, and unsubscribes on unmount.
- Thread `bridge.device` from `entry.tsx` into `ShiftBridgeRuntimeChrome` and mount `ShiftDeviceBridge` alongside `ShiftClockBridge`.
- Derive live Shift network display from `deviceStateAtom.network` in `ShiftHomeRoute`; do not read the default `shiftNetworkReadingAtom` for production live rendering once real device state exists.
- Keep `shiftNetworkReadingAtom` only for fixture/catalog compositions that intentionally render a seeded status bar. Lab/design events that represent device facts should write `deviceStateAtom.network` so they exercise the production derivation.
- Update live-coordinate publication so captured power/network reflect the current derived values rather than the seed/default atoms.
- When `bridge.device` is absent or network is unknown/read-error, render an explicit hidden/unknown network state rather than falling back to the fake connected default.
- Define the Shift network presentation matrix in code/tests: connected shows the network icon with a strength-aware accessible label when strength exists; disconnected shows the disconnected icon and label; unknown/read-error/bridge-absent omit the icon or render the chosen muted unknown affordance without claiming connectivity.

**Execution note:** Add the bridge tests before changing `entry.tsx`; the bridge is the critical seam that proves the surface is presented data rather than obtaining it.

**Patterns to follow:**
- `product/surfaces/web/shift/ShiftClockBridge.tsx` and `product/surfaces/web/shift/ShiftClockBridge.test.tsx`.
- `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx` current-state-first device subscription caution.
- `tools/theme-workshop/lab/adapters/shift-edges.ts` atom-driven lab device events.

**Test scenarios:**
- Happy path: a fake bridge emits a ready battery/network `DeviceState`; `ShiftDeviceBridge` writes it to `deviceStateAtom`.
- Happy path: a subsequent emitted state updates the atom and route-derived network display.
- Edge case: `device` capability is absent; the bridge renders nothing, throws no error, and leaves device state unknown.
- Edge case: unmount calls unsubscribe and subsequent fake emissions do not update the atom.
- Edge case: network unknown/read-error does not produce the default connected reading.
- Integration: `ShiftHomeRoute` passes derived network and battery values to `ShiftCinematicHome` from `deviceStateAtom`.
- Integration: `readShiftCurrentCoordinate()` captures the live derived battery/network values after the route publishes them.

**Verification:**
- Production Shift has a live path from `KorriPlatformBridge.device.subscribe` to the status bar, and fixture/lab paths still drive the same display derivations through atoms.

---

### U4. Add optional battery percentage display to Shift status UI

**Goal:** Let Shift display a battery percentage when the composing host opts in, while preserving the existing icon-only status-bar look by default.

**Requirements:** R5, R7

**Dependencies:** U3

**Files:**
- Modify: `product/surfaces/web/shift/ui/atoms/ShiftBattery.tsx`
- Create or modify: `product/surfaces/web/shift/ui/atoms/ShiftBattery.test.tsx`
- Modify: `product/surfaces/web/shift/ui/molecules/ShiftStatusBar.tsx`
- Create or modify: `product/surfaces/web/shift/ui/molecules/ShiftStatusBar.test.tsx`
- Modify: `product/surfaces/web/shift/shift-power-state.ts`
- Modify: `product/surfaces/web/shift/shift-power-state.test.ts`
- Modify: `product/surfaces/web/shift/pages/ShiftCinematicHome.tsx`
- Modify: `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`

**Approach:**
- Thread raw battery percentage through `shiftBatteryPropsForPowerDisplay` only when the live composition requests a percentage-presenting battery prop.
- Represent optionality by data presence or a small labeled display mode rather than adding broad boolean forests to every component.
- Render percentage text inside the existing battery/status cluster so spacing, ordering, and atomic design ownership stay local to `ShiftBattery`/`ShiftStatusBar`.
- Use the compact label format already implied by the device fact (`82%`), keep it adjacent to the battery icon, no-wrap it with the icon, and use existing status-bar type/spacing tokens rather than arbitrary values.
- Add accessible text for icon-only and percentage modes: decorative icons remain `aria-hidden`, while the wrapper/label communicates battery level, percentage when present, and charging state.
- Preserve the current stale behavior: stale battery data remains omitted unless a future design defines a stale visual treatment.

**Patterns to follow:**
- `product/surfaces/web/shift/ui/atoms/ShiftBattery.tsx` existing icon selection.
- `product/surfaces/web/shift/ui/molecules/ShiftStatusBar.tsx` pure prop-driven status composition.
- `docs/solutions/best-practices/focusable-actions-inside-status-clusters-2026-05-04.md` for status-cluster rhythm and avoiding sibling wrappers.

**Test scenarios:**
- Happy path: icon-only battery props render the existing battery icon with no numeric label.
- Happy path: battery props with percent render the icon plus percentage text.
- Happy path: charging plus percent renders the charging icon and percent label together.
- Edge case: missing/null battery percent omits the label rather than rendering placeholder text.
- Error path: unknown/no-battery/read-error display states still omit the battery slot.
- Accessibility: when percent is present, the rendered output exposes a text/label equivalent such as battery percentage and charging state without making the decorative icon itself meaningful.
- Integration: `ShiftHomeRoute` can opt into percentage display for the live home without changing fixture-only status-bar compositions.

**Verification:**
- Shift can render either icon-only or icon-plus-percentage battery without altering the source-of-truth device model.

---

### U5. Align lab events and fixture seeds with real device derivation

**Goal:** Ensure the design lab, surface-part seeds, and focused tests continue to use the same production derivation path for battery and network after the live device facts land.

**Requirements:** R1, R4, R6, R7

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `tools/theme-workshop/lab/adapters/shift-edges.ts`
- Modify: `tools/theme-workshop/lab/seed/shift-seed.ts`
- Modify: `product/surfaces/web/shift/ShiftHome.page.part.tsx`
- Modify: `product/surfaces/web/shift/shift-catalog-state-samples.test.tsx`

**Approach:**
- Extend Shift lab events/seeds so battery and network samples can populate the new `DeviceState.network` shape and still reach the real status bar through production derivations.
- Keep network as an event-driven device fact in the lab, not a held prop or hand-authored status-bar fixture.
- Keep invariant work focused on status-fact seeds/events for this plan; broader part-first/catalog invariant expansion is deferred.
- Add sample coverage for connected, disconnected, unknown, no-battery, ready-battery-with-percent, and read-error-ish degraded states without bypassing the device-state adapter.

**Patterns to follow:**
- `docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md`.
- `docs/solutions/architecture-patterns/pico-parts-are-the-app-2026-07-02.md`.
- `tools/theme-workshop/lab/adapters/shift-edges.ts` existing battery event writing `deviceStateAtom`.
- `tools/theme-workshop/lab/seed/shift-seed.ts` current battery seed conversion.

**Test scenarios:**
- Happy path: a lab battery event updates `deviceStateAtom` and the rendered Shift status bar shows the corresponding battery display.
- Happy path: a lab network event writes `deviceStateAtom.network` and the rendered status bar changes between connected/disconnected.
- Edge case: a part seed with no network data produces the explicit unknown/hidden state, not default connected.
- Integration: focused lab/fixture test asserts Shift battery/network events seed through device-state atoms rather than raw rendered props.
- Integration: design-tool current-coordinate capture returns values matching the live atom-derived display after lab events fire.

**Verification:**
- Lab, story/part samples, and production route all exercise the same battery/network derivation path; no separate fake network/battery prop path remains for live device facts.

---

## System-Wide Impact

- **Interaction graph:** Device-state server refresh now reads battery and network, emits one `DeviceState`, portal bridge subscribes once, Shift bridge writes `deviceStateAtom`, and route/status components derive display props.
- **Error propagation:** Provider failures become typed `DeviceState` variants. The SSE transport stays a transport concern; UI should not infer network/battery domain state from EventSource liveness.
- **State lifecycle risks:** Duplicate suppression must compare facts, not timestamps. A network polling reader must not emit every interval just because `observedAt` changed.
- **API surface parity:** `app.device.status`, `/api/device/events`, `KorriPlatformBridge.device`, and any tests/guards that assert `DeviceState` shape must be updated together.
- **Integration coverage:** Unit tests prove pure adapters/readers; bridge and route tests prove the cross-layer path from device event to rendered Shift status props.
- **Unchanged invariants:** Shift atoms/molecules stay source-agnostic and prop-driven; surfaces still do not read sysfs/browser APIs directly; `shiftNetworkReadingAtom` remains available for fixture/lab contexts but no longer serves as live production truth.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Sysfs network readings vary by driver (`operstate=unknown`, carrier read errors, missing wireless stats). | Model unknown and read-error explicitly; use `/proc/net/wireless` only as best-effort enrichment; cover driver edge cases with fixture tests. |
| Network polling emits too often or flips between equivalent states. | Extend `deviceStatesEqual` to strip timestamps and compare normalized network facts only. |
| Shift accidentally keeps showing the default connected network atom in production. | Route live rendering through a `DeviceState` adapter and add tests for unknown/read-error not mapping to default connected. |
| Battery bridge duplicates current-state fetch and races stream events. | Subscribe to the current-state-first bridge only; do not add a separate `status()` call in the Shift bridge. |
| Optional percentage crowds the status bar. | Keep percentage opt-in and contained inside the battery/status cluster; fixture samples can continue icon-only. |
| Lab samples bypass production derivation for convenience. | Add focused lab/fixture tests that device facts seed atoms/events, not rendered props. |
| Whole-repo typecheck has existing unrelated failures. | Feature implementation should still keep changed files type-clean and record any pre-existing failures separately during execution. |

---

## Documentation / Operational Notes

- If the network reader adds environment overrides such as a sysfs root or explicit interface name, document them at the reader/module seam and in any NixOS module that sets them.
- If future platforms need richer connectivity states, add NetworkManager/ConnMan adapters behind the same `DeviceState.network` contract rather than changing Shift UI code.
- Consider adding a follow-up solution note after implementation if the sysfs network reader exposes platform-specific gotchas worth preserving.

---

## Sources & References

- Prior plan: `work/items/active/20260701154000-device-state-events/plan.md`
- Work item: `work/items/active/20260705181500-shift-device-status-facts/work.md`
- Device facts model: `product/platform/device/device-facts.ts`
- Device-state service: `product/apps/portal/api/device/device-state.ts`
- Portal bridge: `product/apps/portal/platform-bridge.ts`
- Shift entrypoint: `product/surfaces/web/shift/entry.tsx`
- Shift clock bridge pattern: `product/surfaces/web/shift/ShiftClockBridge.tsx`
- Shift route/display derivation: `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`
- Shift battery display mapping: `product/surfaces/web/shift/shift-power-state.ts`
- Shift network display mapping: `product/surfaces/web/shift/shift-network-state.ts`
- Shift status bar: `product/surfaces/web/shift/ui/molecules/ShiftStatusBar.tsx`
- Shift battery atom: `product/surfaces/web/shift/ui/atoms/ShiftBattery.tsx`
- Lab Shift edges: `tools/theme-workshop/lab/adapters/shift-edges.ts`
- Lab Shift seed: `tools/theme-workshop/lab/seed/shift-seed.ts`
- Institutional learning: `docs/solutions/architecture-patterns/korrid-device-state-subscriptionref-2026-07-01.md`
- Institutional learning: `docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md`
- Institutional learning: `docs/solutions/architecture-patterns/pico-parts-are-the-app-2026-07-02.md`
- External: Linux operstate docs, https://docs.kernel.org/networking/operstates.html
- External: Linux sysfs net ABI, https://www.kernel.org/doc/Documentation/ABI/testing/sysfs-class-net
