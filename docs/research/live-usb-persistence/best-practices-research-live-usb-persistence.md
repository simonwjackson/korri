# Best-practices research: NixOS live USB persistence modes

_Date: 2026-05-24_

## Research scope and source quality

- No relevant local `SKILL.md` guidance was found for NixOS live USB persistence.
- Highest-value sources: upstream systemd man pages/guidance, NetworkManager reference docs, nix-community Impermanence README, and existing Korri live-USB docs/tests.
- Deprecation check: not applicable; this plan does not depend on an external API/service.

## Core guidance for the plan

### 1. Keep product mode allowlisted, not “persistent root”

- Use an impermanence-style model: ephemeral root plus explicit persistent storage. The Impermanence project defines the pattern as “choose what files and directories you want to keep between reboots — the rest are thrown away,” requiring a wiped root, a mounted persistent volume, and bind/link declarations.
- Product mode should persist only appliance continuity state: Korri XDG config/data/state, Moonlight client pairing/cache needed for stream reuse, selected network setup, input/device setup state if required, `/etc/machine-id`, NetworkManager identity state, and bounded diagnostics.
- Do not persist whole `/var`, `/etc`, `/home`, `/nix`, browser caches, package-manager state, or broad logs in product mode. That turns the live appliance into a drifting mutable install.
- Persistent storage must be available before dependent services start. The Impermanence README warns that persistent/ephemeral storage volumes should be marked/ordered as needed for boot; Korri already follows this principle by requiring `korri-live-usb-persistence.service` before login/kiosk startup.

### 2. Same-stick USB persistence is the right safety boundary

- Do not mount by label alone. Labels are not globally unique and could match an internal disk. The current Korri shape is safer: resolve the boot ISO device, derive the parent USB block device, and only accept a sibling `KORRI-PERSIST` partition on that same USB.
- Failure must be safe: if the approved same-stick persistence area is absent, malformed, or unwritable, fall back to clearly marked ephemeral behavior or fail visibly. Never search internal disks for a “helpful” alternative.
- Avoid generic auto-mounting paths in the appliance. Korri already disables swap devices, udisks2, and gvfs in the live USB runtime checks; keep that posture.
- Also account for systemd GPT auto-discovery: `systemd-gpt-auto-generator` can auto-discover `/home`, `/srv`, `/var`, `/var/tmp`, ESP/XBOOTLDR, and swap partitions based on GPT type GUIDs, and swap auto-discovery is enabled by default unless disabled via `systemd.swap=0`. This is a pitfall for a “never write internal disks” appliance.

### 3. `/etc/machine-id`: persist per USB, never bake into the image

- For a golden/live image, upstream systemd recommends removing `/etc/machine-id` or writing `uninitialized\n` so each deployed instance gets a unique ID. If a valid ID is baked into the image, every copied USB shares identity, which can affect network-visible identifiers.
- For this appliance, persist the generated machine ID on the USB persistence area after first boot. Stable identity helps NetworkManager, journald directory continuity, D-Bus/systemd expectations, and any app-specific host identity.
- If product mode intentionally runs without persistence, prefer an empty/uninitialized runtime-safe machine-id strategy rather than a baked valid ID. Be aware of first-boot semantics: missing or `uninitialized` means first boot; an empty file is not considered first boot but can be overmounted with a runtime ID.
- Treat machine ID as confidential. systemd documents that it uniquely identifies the host and should not be exposed directly in untrusted environments; derive app IDs with keyed hashing if needed.

### 4. NetworkManager state: persist profiles plus host identity, tightly

- NetworkManager stores keyfile connection profiles in `/etc/NetworkManager/system-connections/`, `/usr/lib/NetworkManager/system-connections/`, and `/run/NetworkManager/system-connections/`; user-created persistent profiles normally land under `/etc/NetworkManager/system-connections/`.
- Product-mode allowlist should include `/etc/NetworkManager/system-connections/` if Wi-Fi or operator-created connections must survive reboot. Ensure files remain root-only: NetworkManager ignores keyfiles readable/writable by non-root because secrets and private keys may be plaintext.
- Also persist `/var/lib/NetworkManager/secret_key` when stable NetworkManager-derived identifiers matter. Upstream NetworkManager says host identity depends on this file and, in recent versions, also hashes `/etc/machine-id` for generated stable MAC/IP identifiers.
- Consider whether to persist `/var/lib/NetworkManager/no-auto-default.state` and `NetworkManager.state` only if their behavior matters. Product mode should avoid wholesale `/var/lib/NetworkManager` unless the extra state is understood.
- If using IWD as the Wi-Fi backend, account for `/var/lib/iwd`; NetworkManager may write converted profiles there depending on configuration.
- For debug mode, NetworkManager TRACE logging is useful but verbose and may be journald-rate-limited. Enable only in explicit debug boots.

### 5. Journald/log persistence: bounded diagnostics, not broad `/var/log`

- journald stores persistent logs under `/var/log/journal/<machine-id>/` and volatile logs under `/run/log/journal/`. Persistent logging depends on configuration and availability of `/var/log/journal`; early boot logs are flushed later by `systemd-journal-flush.service`/`journalctl --flush`.
- Product mode should either keep journald volatile and export/copy selected diagnostic facts to USB, or persist only `/var/log/journal` with strict size/retention limits. Do not persist all `/var/log` by default.
- If persistent journald is enabled, also persist stable `/etc/machine-id`; otherwise logs fragment across machine-id directories.
- Set explicit storage and quota policy in the plan. journald supports `Storage=volatile|persistent|auto|none`, `SystemMaxUse`, `RuntimeMaxUse`, `MaxRetentionSec`, and related bounds.
- Avoid `ForwardToConsole=yes` in production as a logging strategy. journald forwarding is synchronous and upstream warns it can block journald and services if the console is slow/hung. Use targeted follow/diagnostic collection in debug mode instead.

### 6. Developer/debug broad persistence: useful, explicit, isolated

- Debug mode should be entered only by an explicit boot menu entry or kernel argument and visibly marked in the session. Do not add a runtime player-facing toggle.
- Use the same same-stick USB resolver and no-internal-disk guardrails as product mode. Debug convenience must not relax the storage trust boundary.
- Keep debug broad persistence separate from product allowlisted state, e.g. a distinct subtree/namespace. Debug artifacts should not silently promote into product mode.
- Broad debug persistence may include wider `/home/korri`, selected `/var/lib`, NetworkManager internals, larger journald retention, coredumps, and service logs. It should still avoid `/nix/store` and full mutable OS/root persistence unless the plan deliberately creates a developer-only “full install on USB” mode.
- Put quotas/cleanup/reset in the debug story. Broad persistence will accumulate caches, journals, coredumps, and accidental configuration drift; this can mask product-mode bugs.
- Treat persisted debug state as sensitive. Network profiles may contain plaintext secrets; logs include IP/network topology; coredumps can contain passwords/configuration.

## Key risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Baked valid `/etc/machine-id` | Every copied USB shares identity; NetworkManager stable IDs and journal paths collide conceptually | Reset image machine-id; generate/persist per USB |
| Label-only persistence discovery | Internal disk with matching label could be mounted/written | Accept only sibling partition of the booted USB parent |
| systemd auto-discovered mounts/swap | GPT auto-generator can mount/use partitions or swap unexpectedly | Disable/override auto-discovery and swap for appliance boots; test no internal sentinel changes |
| Persisting `/var` or `/home` in product mode | Product drifts like a mutable OS install | Product allowlist only; separate debug broad mode |
| NetworkManager keyfile permissions | NM ignores insecure profile files; Wi-Fi creds may silently not load | Enforce root-only ownership/modes; test rebooted connection reuse |
| Lost NM `secret_key` or machine-id | Stable MAC/IP/DHCP identifiers can change across boots | Persist both `/etc/machine-id` and `/var/lib/NetworkManager/secret_key` if network identity stability matters |
| Persistent logs fill USB | Small removable media can fill and break kiosk state | Explicit journald quotas/retention; product mode should keep logs bounded |
| Debug mode mistaken for product | Broad persistence hides product regressions | Explicit boot activation, visible marker, separate state namespace |
| Debug state leaks secrets | USB is removable; logs/profiles/coredumps can expose credentials | Minimize product persisted secrets; consider encryption or documented physical-security assumptions |

## Planning implications for Korri

- Keep the existing same-stick resolver as the base invariant for both modes.
- Product allowlist should likely add, beyond existing Korri/Moonlight state:
  - `/etc/machine-id`
  - `/etc/NetworkManager/system-connections/` if operator network profiles are in scope
  - `/var/lib/NetworkManager/secret_key`
  - carefully bounded diagnostics, preferably not whole `/var/log`
- Debug mode should be a separate boot contract that broadens persistence only under the same USB root and surfaces a prominent marker.
- Tests should prove: selected product state survives reboot; non-allowlisted state does not; debug state survives only in debug mode; missing persistence never selects internal disk; internal disk sentinel/hash remains unchanged; NetworkManager profiles load after reboot with secure permissions; journald remains bounded.

## Source links

- nix-community Impermanence README — pattern, tmpfs root tradeoffs, persistence declarations, `hideMounts`, examples including `/etc/machine-id`, `/etc/NetworkManager/system-connections`, `/var/log`: https://github.com/nix-community/impermanence
- Official NixOS Wiki: Impermanence — NixOS-specific overview; note the page is marked outdated, so treat examples as secondary: https://wiki.nixos.org/wiki/Impermanence
- systemd `machine-id(5)` — initialization, first-boot semantics, confidentiality: https://man7.org/linux/man-pages/man5/machine-id.5.html
- systemd “Safely Building Images” — reset machine-id/random seeds in golden images; first-boot identity: https://systemd.io/BUILDING_IMAGES/
- NetworkManager keyfile plugin — profile locations, root-only permissions, plaintext secret caveat: https://networkmanager.dev/docs/api/latest/nm-settings-keyfile.html
- NetworkManager daemon reference — `/var/lib/NetworkManager/secret_key`, machine identity, debug logging: https://networkmanager.dev/docs/api/latest/NetworkManager.html
- NetworkManager configuration reference — `/var/lib/NetworkManager/NetworkManager-intern.conf`, `no-auto-default.state`, logging, IWD path: https://networkmanager.dev/docs/api/latest/NetworkManager.conf.html
- `journald.conf(5)` — `Storage`, quota/retention settings, forwarding caveats: https://man7.org/linux/man-pages/man5/journald.conf.5.html
- `systemd-journald.service(8)` — volatile vs persistent paths, flush behavior, journal access, file layout: https://man7.org/linux/man-pages/man8/systemd-journald.service.8.html
- `systemd-gpt-auto-generator(8)` — auto-discovered mounts/swap and kernel switches: https://man7.org/linux/man-pages/man8/systemd-gpt-auto-generator.8.html
- Korri live USB docs — current same-stick `KORRI-PERSIST` resolver and physical acceptance checklist: `docs/deployment/korri-images.md`
