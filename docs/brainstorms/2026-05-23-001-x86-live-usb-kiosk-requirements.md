---
date: 2026-05-23
topic: x86-live-usb-kiosk
---

# x86 Live USB Korri Kiosk

## Summary

Build a bootable x86 live USB that turns an Intel NUC into a Korri living-room kiosk. The kiosk boots from USB, discovers online Korri servers over Ethernet, shows remote library content through the Korri surface, and launches Moonlight streams for selected games while leaving the internal disk untouched.

---

## Problem Frame

The current NUC/TV path for playing games hosted elsewhere is manual. The player has to operate the client setup directly, reason about the server separately, and bridge the gap between “the game I want to play” and “the stream machinery that can run it.” That makes the living-room endpoint feel like a general-purpose computer workflow instead of a console-like Korri surface.

Korri already has a product direction where server discovery and remote play are content-centered: online servers on the LAN expose playable content, and the client should make the host feel like infrastructure behind the library. The missing piece is a bootable x86 appliance shape for a physical TV-connected machine.

---

## Actors

- A1. Player/operator: Boots the NUC from USB and uses Korri from the TV with keyboard and USB gamepad.
- A2. x86 live USB kiosk: The booted Korri client appliance running on the NUC.
- A3. Discovered Korri server: A LAN server that advertises availability and exposes remote library content and stream actions.
- A4. Stream runtime: The existing Moonlight/Sunshine path that turns a selected remote game into a playable stream.

---

## Key Flows

- F1. Boot into Korri kiosk
  - **Trigger:** The player boots the NUC from the Korri USB stick.
  - **Actors:** A1, A2
  - **Steps:** The machine boots from USB, starts the Korri kiosk session, initializes keyboard/gamepad input, uses wired networking, and avoids any internal-disk install or mutation.
  - **Outcome:** The TV shows Korri as the primary appliance surface.
  - **Covered by:** R1, R2, R3, R4, R5, R6

- F2. Discover server content
  - **Trigger:** The kiosk session is running and Ethernet is connected.
  - **Actors:** A2, A3
  - **Steps:** The kiosk uses the existing Korri LAN discovery behavior, finds online Korri servers, connects according to the existing connection model, and presents discovered remote library content.
  - **Outcome:** The player can browse remote playable content without host-specific manual setup.
  - **Covered by:** R7, R8, R9, R10, R11

- F3. Launch a remote stream
  - **Trigger:** The player selects a remote game from the Korri kiosk.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The kiosk asks the discovered server to prepare the selected known game, then launches Moonlight locally to connect to the stream runtime. If Moonlight cannot connect, the kiosk reports the failure clearly.
  - **Outcome:** The selected remote game becomes playable on the NUC through the stream.
  - **Covered by:** R12, R13, R14, R15

- F4. Persist client settings
  - **Trigger:** The player changes client settings or the kiosk records client-side connection/runtime preferences.
  - **Actors:** A1, A2
  - **Steps:** The kiosk stores client settings on the USB’s persistent area, not the NUC internal disk, and reloads them on the next boot.
  - **Outcome:** The live USB remains portable but does not behave like a fully stateless demo image.
  - **Covered by:** R16, R17

---

## Requirements

**Bootable appliance shape**
- R1. The first acceptance target is an 8th-gen Intel NUC.
- R2. The image must be a live USB appliance, not an installer.
- R3. Booting the USB must not install to, repartition, or intentionally modify the NUC internal disk.
- R4. The kiosk should be NUC-first but avoid NUC-specific product behavior or hard-coded host assumptions that would obviously block other UEFI x86_64 machines.
- R5. The live session must boot directly into the Korri kiosk surface rather than a general desktop workflow.
- R6. The first version must require keyboard and common wired USB gamepad input. Bluetooth controller setup is not required.

**Network and discovery**
- R7. Ethernet is the only required network path for v1.
- R8. The kiosk must reuse Korri’s existing LAN online-server discovery mechanism.
- R9. The kiosk must not special-case `aka` by name, address, priority, or fallback behavior.
- R10. When exactly one compatible Korri server is discovered, the kiosk may connect automatically according to the existing connection behavior.
- R11. When multiple compatible servers are discovered, v1 must rely on existing discovery/connection behavior rather than inventing a new multi-server product UI for this slice.

**Library and launch behavior**
- R12. The initial useful catalog comes from discovered remote Korri servers.
- R13. A local NUC catalog is allowed by the model but is not required to exist or contain games for v1 acceptance.
- R14. Selecting a remote game must ask the discovered server to prepare a known library game, not send an arbitrary command for remote execution.
- R15. After a remote game is prepared, the kiosk must launch Moonlight locally and attempt to enter the stream.

**Persistence and failure handling**
- R16. The live USB must persist client settings across boots.
- R17. Persistence must be scoped to the USB media or its intended persistent area, not the NUC internal disk.
- R18. Moonlight/Sunshine pairing is assumed to already exist; v1 must fail clearly when pairing or connection is missing rather than trying to provide pairing UX.
- R19. Failure states must distinguish enough causes for the player/operator to know whether the issue is boot/input, Ethernet, discovery, server reachability, catalog availability, remote preparation, or Moonlight launch.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R5.** Given the Intel NUC is configured to boot from USB, when the Korri USB stick boots, the machine enters the Korri kiosk surface and does not require or perform an internal-disk install.
- AE2. **Covers R6, R7.** Given the NUC has Ethernet and a wired USB gamepad connected, when the kiosk starts, keyboard fallback and gamepad navigation are available and no Wi-Fi or Bluetooth setup is required.
- AE3. **Covers R8, R9, R10, R11.** Given a compatible Korri server is online on the LAN, when the kiosk starts discovery, it finds/connects through the existing Korri discovery behavior without any aka-specific rule.
- AE4. **Covers R12, R13.** Given the NUC has no local game catalog but a discovered server exposes remote games, when the kiosk renders playable content, remote library entries are available and the missing local catalog does not block use.
- AE5. **Covers R14, R15, R18.** Given Moonlight is already paired and the player selects a remote game, when the server prepares that known game successfully, the NUC launches Moonlight and attempts to connect to the stream.
- AE6. **Covers R16, R17.** Given the player changes client settings, when the NUC reboots from the same USB stick, those settings are restored without relying on the NUC internal disk.
- AE7. **Covers R18, R19.** Given Moonlight is not paired or cannot connect, when a remote game launch reaches the stream step, the kiosk reports a stream-connection failure instead of presenting it as a discovery or catalog failure.

---

## Success Criteria

- The NUC can boot from a USB stick into a Korri-first TV appliance experience.
- The player can use keyboard and USB gamepad input without dropping into a manual desktop workflow.
- With Ethernet connected and a compatible Korri server online, the kiosk discovers remote library content without aka-specific configuration.
- Selecting a remote game launches the local Moonlight stream path and reaches playable output when pairing is already valid.
- Rebooting from the same USB stick preserves client settings while leaving the NUC internal disk untouched.
- Downstream planning can proceed without inventing the product stance on installer behavior, Wi-Fi, server special-casing, local catalog requirements, Moonlight pairing, or multi-server UI.

---

## Scope Boundaries

- Installing Korri to the NUC internal disk is out of scope.
- Wi-Fi setup is out of scope.
- Bluetooth pairing and controller-pairing polish are out of scope.
- Moonlight/Sunshine pairing UX is out of scope; valid pairing is assumed.
- Aka-specific host pinning, naming, or fallback behavior is out of scope.
- New multi-server federation UI is out of scope; v1 uses existing discovery/connection behavior.
- Generic x86 release-candidate compatibility is out of scope beyond avoiding obvious NUC-only product assumptions.
- Local game launching from the NUC is not an acceptance requirement.
- A fully polished diagnostics/settings suite is out of scope beyond the failure clarity needed for v1.

---

## Key Decisions

- Live USB over installer: This keeps the first x86 appliance proof reversible and safe for the NUC.
- Remote-first catalog for v1: The useful content comes from discovered Korri servers; local catalog support can exist in the model without being populated initially.
- No aka special treatment: The target real-world server may be aka, but the product behavior should remain generic LAN Korri discovery.
- Ethernet-only v1: Wired networking avoids Wi-Fi credentials and setup UX while proving the living-room kiosk loop.
- Pairing assumed: Moonlight/Sunshine pairing is a prerequisite, not part of this slice.
- Persist client settings on USB: The kiosk should feel reusable across boots without becoming an internal-disk install.

---

## Dependencies / Assumptions

- A compatible Korri server can advertise on the LAN through the existing online-server discovery mechanism.
- The discovered server can expose remote library content and prepare known games for streaming.
- Moonlight can run locally on the x86 kiosk environment and connect when pairing is already valid.
- The USB image can provide or allocate a persistence area suitable for client settings without touching internal disks.
- The 8th-gen Intel NUC can boot the chosen x86_64 live image path over UEFI and has working wired networking and graphics support under the selected base system.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R16, R17][Technical] What live-image format and persistence strategy best fit NixOS/Korri while preserving the no-internal-disk guarantee?
- [Affects R5, R6][Technical] What exact boot/session ordering proves the kiosk surface, input bridge, and client runtime are ready without exposing a desktop fallback in normal use?
- [Affects R8, R10, R11][Technical] How should the current discovery/connection mechanism behave on a kiosk when zero, one, or multiple servers are found?
- [Affects R15, R18][Technical] What local Moonlight invocation and persisted client state are required for reliable stream launch on the live USB?
- [Affects R19][UX] What is the minimum failure-state presentation that is clear on a TV with keyboard/gamepad input?
