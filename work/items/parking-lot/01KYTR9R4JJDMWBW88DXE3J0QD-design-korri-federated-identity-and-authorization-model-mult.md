---
id: 01KYTR9R4JJDMWBW88DXE3J0QD
slug: design-korri-federated-identity-and-authorization-model-mult
title: Design Korri federated identity and authorization model (multi-device, roaming users)
origin: parked
status: To Do
priority: high
labels:
  - architecture
  - security
  - identity
  - federation
  - korrid
  - design-needed
created: 2026-07-31
source: se-brainstorm
context:
  cwd: korri
  branch: trunk
  repo: korri
  invoked_by: user
---

# Design Korri federated identity and authorization model (multi-device, roaming users)

## Why it matters

Korri is becoming multi-device AND multi-user, with people roaming between devices — but there is currently no auth/authz layer at all. korrid RPC is unauthenticated, and the only existing control is `installControlSecret`: a shared bearer secret that cannot be scoped per-device, cannot be revoked individually, and leaks sideways if any holder is compromised. Without this layer, federation cannot safely extend past a trusted network, and the design would implicitly require Tailscale — which the user explicitly rejected as a hard dependency ("I want this to work with or without Tailscale... I don't want to design a system that just works on-network or off-network"). The compounding value is high: identity is the foundation that save-roaming, guest access, library sharing, and per-person entitlements all sit on. Every month it stays undesigned, more ad-hoc secrets (like installControlSecret) accrete and have to be unwound later.

## Acceptance Criteria

- [ ] Each korrid generates a device keypair on first run; identity survives restarts and config changes
- [ ] Person identity is separate from device identity; one person can be authenticated on multiple devices simultaneously
- [ ] Every korrid RPC request carries a signature in the existing (currently unused) `headers` field of the request envelope
- [ ] korrid verifies signature + looks up per-key permission before dispatching any tag
- [ ] Authorization is decidable offline — no central service, no network round-trip, no account server
- [ ] Identical code path regardless of transport (LAN / Tailscale / open internet): no on-network vs off-network branching anywhere
- [ ] `installControlSecret` shared-secret path removed and subsumed by per-key permission grants
- [ ] Permission tiers implemented: owner / household / guest / unknown, with new identities defaulting to guest (play-only)
- [ ] First arrival of an identity on a device requires one explicit approval (owner tap or code); remembered thereafter
- [ ] Device stores a time-limited, scope-limited session pass — never the person's identity key
- [ ] Guests can only launch software the owner installed; install is a separate explicit grant
- [ ] Per-identity data separation on Android (single app sandbox — Korri must implement isolation itself), including guest data wipe at session end

## Related

- `product/apps/portal/api/stream/prepare.rpc.ts`
- `packages/pi-korrid-tools/src/korrid-tools.ts`
- `docs/research/gamenative-local-windows-transport.md`

## Notes

## Core reframe (the load-bearing idea)

Tailscale's job today is making the *network* trustworthy. If Tailscale can't be assumed, the network can't be assumed — so trust must move into the messages themselves. **Sign every request; then the pipe stops mattering.** This is what makes "works with or without Tailscale" achievable without designing two systems.

## Two kinds of identity

| | What | Where it lives | Decides |
|---|---|---|---|
| Device | aka, tablet, handheld | fixed to hardware, made on first run | what is *possible* (games installed here, hardware, can it stream) |
| Person | Simon, friend, kid | travels with the human | what is *permitted* and *whose* (their games, their saves, install rights) |

Authorization = the pair. Same device, two people: one sees 40 games + install; the other sees their permitted 12, their own saves, no install. Person's entitlements follow them to the handheld; the device remains authority on what is actually installed there.

## Nostr decision: MATCH THE KEY FORMAT, SKIP THE RELAYS (for now)

Multi-person is confirmed, which resolves the earlier fork in the road. Rationale:
- **Take**: the identity model (person = keypair, not a database row). Buys: no signup, no account server, no password resets, nothing to breach. A friend joins by handing over a public key. Your identity works on their hardware and theirs on yours, with no federation agreement between servers. Matching the key format now costs ~nothing and preserves optionality for friend-discovery/contact-list primitives later.
- **Skip**: relays. They are a *delivery* mechanism, not a *trust* mechanism, and are wrong for LAN (extra hop on the interactive path: catalog.snapshot, stream.prepare), fight typed request/response (Effect RPC already gives typed defects — see the BigInt id bug), have payload caps vs catalog+artwork, and add availability dependence.
- **Revisit relays only for**: reaching machines when neither has a public address and there's no VPN; queueing commands for a sleeping device; multi-person delivery.
- Because signing lives in the message, adding relay delivery later changes nothing already built.

## Precedents to copy

- **NIP-47 (Nostr Wallet Connect)** is almost exactly this problem: a connection URI grants a client scoped RPC access to a remote service, with a per-connection key and capability list. Swap `pay_invoice` → `stream.prepare`. Their `get_info` ≈ our `app.server.status`. Use as the pairing-URI/QR blueprint.
- **Sunshine/Moonlight pairing is the in-house precedent**: PIN once, then certificate-based trust, after which the network is irrelevant. The streaming layer already got this right; the control layer (korrid) has not caught up. This is applying a proven-in-our-own-stack pattern, not inventing one.
- If it later turns out pure authz is the goal and multi-person is not, **UCAN / biscuit** capability tokens are the more targeted tools (delegatable, offline-verifiable) — but they don't provide pairing UX or social-graph primitives.

## Roaming: how a person's key travels

Never leave a person's identity key permanently on a shared device (lose the device = lose them everywhere). Instead the device holds a **pass**: time-limited, scope-limited, "this device may act as X for these actions until <expiry>". Revoke = delete one pass. Three entry paths:
1. **Phone approves** — walk up, device prompts, approve on phone. Strongest; requires phone present.
2. **Existing pass** — already signed in here, just works until expiry. The everyday case.
3. **Profile + PIN** — shared couch device, kid with no phone. Weaker but honest.

## Security implications of "anybody with an account can float" (user's stated ideal)

Key insight: **a free account proves continuity (same person as last time), not trustworthiness.** So identity can be wide open; it just can't be the thing that grants access. Separate "who can be here" (open) from "what they can do here" (the real gate).

Risks ordered by actual impact:
1. **Whose code runs** — dominant risk. A launched game is arbitrary code with your network position; a stranger installing software gives them a foothold inside your home network. Mitigated almost entirely by the one rule: *guests run only owner-installed code.*
2. **Data bleeding between people** — saves, Steam logins, profile data co-resident. Needs per-identity separation + guest wipe on exit.
3. **Resources** — disk fill (200GB library), GPU pinning, uplink saturation.
4. **Entitlements** — your licensed games playable by others; fine in a household, be deliberate beyond it.

Not fixable by any of this: **physical access** (power off, USB, walk away with it). Same risk already accepted for any console in a living room.

## Android-specific constraint

The one-APK design has a *single* data sandbox; Android will not separate two humans inside it. Korri must implement per-identity directories itself and actually wipe guest data at session end. This is code to write, not a guarantee inherited from the OS.

## Save roaming implication

A person arriving on a device expects their progress, so arrival triggers pulling their data from wherever it lives. That is a resource cost, a privacy decision (their saves now sit on your hardware), and the reason "wipe guest data on exit" matters. Save *data* moves by ordinary sync (too big for the identity layer); the key answers *whose* saves, stably, without an account server.

## Open question blocking full design

Do people cross **ownership** boundaries — will a friend's *device* ever join with their hardware and library, not just their identity on your hardware? If yes, devices must also authenticate to each other (a device deciding whether to trust another device's claims about its library), and that belongs in the design from the start. If roaming is only across hardware the user owns, device trust stays simple and this can remain one layer.
