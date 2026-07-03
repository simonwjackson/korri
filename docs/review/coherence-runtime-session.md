# Coherence review: runtime-session plan

## Findings

### 1. Frontmatter verification command omits checks the plan says to add

**Evidence:** The frontmatter `verify_command` only runs source-machine, SM8550, and RK3566 checks (`plan.md:6`). U1 adds or extends a runtime module check and wires it into flake checks (`plan.md:151-152`), and U3 creates `korri-x86-audio-module-check.nix` and wires it into flake checks (`plan.md:228-231`). U4 also conditionally adds or updates an RK3326 config check (`plan.md:271`).

**Why it matters:** The plan has two competing definitions of the validation surface: the metadata command excludes checks that the implementation units treat as required. An implementer could finish U1/U3 and still run the advertised command without exercising the new gates.

**Suggested plan edit:** Update `verify_command` to include the new runtime and x86 audio checks, plus the RK3326 check if U4 makes it required. If the frontmatter is intended as a shorter smoke command, rename/comment it as such and add a separate full verification command that matches U1-U4.

---

### 2. R2 conflicts with placing Sway/Wayland sockets directly under `%t`

**Evidence:** R2 says Korri-owned runtime files must stay under explicit subdirectories and not use `XDG_RUNTIME_DIR` itself as a Korri namespace (`plan.md:26`). The design diagram places `wayland-1 + sway-ipc.sock` directly under the runtime root (`plan.md:122`), U2 expects `SWAYSOCK == "%t/sway-ipc.sock"` (`plan.md:205`), and System-Wide Impact says the change moves source-machine sockets from `%t/korri-compositor` to `%t` (`plan.md:371`).

**Why it matters:** A reader cannot tell whether compositor-managed sockets are an intended exception to R2 or an accidental violation. That changes whether U2 should preserve `%t/sway-ipc.sock` or move it under a Korri subdirectory.

**Suggested plan edit:** Add an explicit carve-out to R2/Summary for compositor-standard Wayland/Sway endpoints that intentionally live at the user runtime root, or change U2/design/System-Wide Impact to keep the stable Sway IPC socket under a Korri-owned subdirectory.

---

### 3. RK-family exception describes two different runtime ownership models

**Evidence:** Key Technical Decisions says RK-family substrate graphs live under a different UID/runtime until the platform can run the compositor/session stack as the Korri runtime user (`plan.md:90`). U4 later says RK3566/RK3326 substrates may place sockets in the Korri runtime user's directory while root-owned services need explicit envs (`plan.md:277`).

**Why it matters:** Those descriptions point implementers at different compatibility boundaries: either sockets are outside the Korri runtime user, or sockets are in the Korri runtime user's directory but accessed from root/system services.

**Suggested plan edit:** Normalize both passages to one model. For example: “RK-family services may cross root/system and Korri-user runtime boundaries; keep explicit absolute bridge envs where a root/system service must reach sockets in the Korri runtime user's directory.” If the opposite is intended, state where the sockets actually live and which user owns them.

---

### 4. RK3326 test ownership is left conditional while RK3326 is in scope

**Evidence:** U4 modifies `rocknix-rk3326.nix` (`plan.md:267`) and the plan repeatedly frames RK-family preservation as in scope (`plan.md:28`, `plan.md:347-358`), but the only RK3326 test instruction is “add or update the RK3326 config check if an equivalent exists” (`plan.md:271`). The frontmatter and Sources list only SM8550/RK3566 checks (`plan.md:6`, `plan.md:405`).

**Why it matters:** The unit is unclear about whether RK3326 needs a first-class regression gate. One implementer may add a check; another may skip it because no equivalent exists.

**Suggested plan edit:** Make U4 deterministic: either name a required new `korri-rocknix-rk3326-config-check.nix`/flake check, or explicitly state that RK3326 is covered by a shared RK-family assertion or is modified without a dedicated check for this slice.
