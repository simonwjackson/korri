# Feasibility review: live USB Product/Developer persistence plan

Overall: the artifact split and same-stick resolver direction are feasible, but the plan needs a few design fixes before implementation. Two gaps would otherwise cause the Product contract to fail even if the Nix evaluation and resolver tests pass.

## Findings

### 1. High — `/etc/machine-id` cannot be made systemd-safe by the planned late resolver layer

**Confidence:** 100

**Evidence:** The plan says Product should allowlist `/etc/machine-id` with “systemd-safe first-boot behavior” (`../../../work/.archive/01KSBMG31TA7ZG64667DM6SRQ3-feat-live-usb-product-developer-persistence/plan.md:103`, `:216`). The current persistence resolver is a normal systemd oneshot wanted by `multi-user.target` and ordered after `local-fs.target` / `systemd-udevd.service` (`nix/images/live-usb-runtime.nix:170-177`), with the Product/Developer setup only required before greetd (`nix/images/live-usb-runtime.nix:140-143`). By then PID 1, journald, dbus-related services, and other early consumers have already observed the boot machine ID.

**Why it matters:** Binding or symlinking `/etc/machine-id` after `local-fs.target` may change the file for later readers or the next boot, but it does not give the current boot a stable per-USB systemd identity. That violates the plan’s own machine identity decision and can produce split identity in logs, dbus, and any service that read the transient ID before the persistence service ran.

**Recommended fix:** Make one of these decisions explicit before implementation:

- Remove `/etc/machine-id` from v1 Product allowlisting and generate a Korri-owned persisted device ID under the approved persistence namespace for app-level identity; or
- Split machine-id handling into an earlier boot mechanism that runs before systemd consumes machine identity, while preserving same-stick validation. If that is not possible with the current `/iso`-derived resolver, defer true `/etc/machine-id` persistence rather than promising it.

Add tests/docs that distinguish “Korri persisted device ID” from “systemd `/etc/machine-id`” if choosing the first path.

---

### 2. High — File-level symlink/bind mechanics cannot be deferred for Korri desktop config

**Confidence:** 100

**Evidence:** The plan defers “Exact bind-vs-symlink mechanics for each allowlist entry” (`../../../work/.archive/01KSBMG31TA7ZG64667DM6SRQ3-feat-live-usb-product-developer-persistence/plan.md:117-119`) while requiring Product to persist Korri desktop config (`:215`). The actual config writer resolves `desktop.yaml` under `XDG_CONFIG_HOME/korri` (`korri/shared/config/xdg-paths.ts:70-75`) and saves by writing a sibling temp file then `rename(tmp, path)` (`korri/deploy/desktop/desktop-config.ts:68-74`).

**Why it matters:** If the allowlist persists only `desktop.yaml` as a symlink, the atomic rename will replace the symlink with an ephemeral regular file. If it persists only the file as a bind mount, atomic replacement can fail or replace the mountpoint semantics. Either way, Product can appear to boot correctly while silently losing the “remembered server/settings survive reboot” contract.

**Recommended fix:** Specify directory-level persistence for atomic-writer paths in the plan, at minimum `XDG_CONFIG_HOME/korri/` rather than just `desktop.yaml`. Add an implementation rule: file entries are only allowed for files not rewritten via temp+rename; writable app state gets a persisted containing directory. Add a shell/unit test that calls `saveDesktopConfig`, reruns Product setup, and verifies the saved `desktop.yaml` comes from the Product persistence namespace.

---

### 3. Medium — Product fallback needs transactional cleanup for partial allowlist setup failures

**Confidence:** 75

**Evidence:** The plan adds multiple Product bind/link/preparation steps (`../../../work/.archive/01KSBMG31TA7ZG64667DM6SRQ3-feat-live-usb-product-developer-persistence/plan.md:213-219`) and requires write-probe / permission failures to be visible (`:231`), but it does not define rollback when one allowlist entry succeeds and a later entry fails. The current resolver only has one mounted root and one preparation function; on failure it unmounts the root before falling back (`nix/images/live-usb-persistence-resolver.sh:69-80`). That cleanup model is insufficient once several bind mounts or symlinks have already been installed into an ephemeral Product home.

**Why it matters:** A mid-setup error can leave a mixed state: some persistent Product paths exposed, some ephemeral paths, stale symlinks, or mounted approved storage under a Product session that is supposed to have fallen back to clear tmpfs. That weakens R12/R13 and makes error behavior nondeterministic.

**Recommended fix:** Add a transactional setup contract to U2/U4:

- preflight all source namespaces and required writable paths before exposing them to the kiosk session;
- track every bind mount/symlink created;
- on any Product setup failure, unmount bind mounts in reverse order, remove created links, and then mount/use the ephemeral tmpfs state;
- only write the Product persistent marker after all allowlist entries and probes succeed;
- for Developer, fail the persistence service before greetd instead of falling back.

Add tests that inject failure after the first successful allowlist mount/link and assert Product starts only with ephemeral markers and no remaining persistent bind/link exposure.
