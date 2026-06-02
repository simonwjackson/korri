---
title: Shipping the KORRI api server to constrained aarch64 handhelds via a Bun single-file bundle
date: 2026-05-27
category: docs/solutions/best-practices
module: api-server
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Running the existing KORRI api server (Hono + Effect + RPC) on an aarch64 handheld with stock vendor OS (EmuELEC / ROCKNIX / Batocera class)
  - Need a single-file shippable artifact that does not require node_modules on the device
  - Target CPU lacks ARMv8.1 LSE atomics (Cortex-A35 in RK3326, similar entry-level cores)
  - Bundling with bun build is failing on jsonc-parser default imports or pino-pretty / thread-stream absolute paths
tags:
  - bun
  - aarch64
  - bundle
  - rk3326
  - cortex-a35
  - effect-rpc
  - hono
  - pino
  - proseql
related_components:
  - korri-server
  - api
---

# Shipping the KORRI api server to constrained aarch64 handhelds via a Bun single-file bundle

## Context

KORRI's api server lives at `tools/http/server.ts` and pulls in the full
`@app/api/hono-app` graph (Hono + Effect + Effect-RPC + ProseQL +
federation + game-assets + library + streams + feature gates + pino).
The dev path is `bun x tsx tools/http/server.ts`, and the production
build pipeline (`just build-api`) emits ~92 JS files under
`out/build/api/` that still resolve `@hono/node-server` and friends
from the **2.4 GB** `node_modules/` tree.

For a constrained aarch64 handheld (R36T MAX, 970 MB RAM, ~1.7 GB free
on `/storage`), shipping `node_modules` is a non-starter. The question
this learning answers: **what is the smallest, most reproducible way
to run the actual KORRI api server on the device, unchanged?**

The answer is a `bun build --target=bun` single-file bundle plus the
official upstream Bun aarch64 binary. Together they are ~95 MB total
and run KORRI's full RPC surface (`app.hello.get`, `app.source.list`,
`app.library.list`, `app.stream.prepare`, ...) including LAN federation
that discovers other KORRI hosts via mDNS.

## Guidance

### 1. Use the official upstream Bun aarch64 release, not a Nix-built copy

Bun's prebuilt `bun-linux-aarch64.zip` is dynamically linked but only
needs glibc 2.27+, libpthread, libdl, libm, and the standard aarch64
dynamic linker — all of which exist on EmuELEC 4.7-Nexus (glibc 2.36).
No Nix wrapping, no `nix-portable`, no `bwrap`, no patchelf. The binary
already targets `/lib/ld-linux-aarch64.so.1`.

```sh
URL="https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-aarch64.zip"
curl -sL -o /tmp/bun.zip "$URL"
unzip /tmp/bun.zip -d /tmp/bun-extract/
# ship single 92 MB binary
ssh device 'cat > /storage/bin/bun && chmod 755 /storage/bin/bun' \
    < /tmp/bun-extract/bun-linux-aarch64/bun
```

**Bun ≥ 1.3.9 is required** for Cortex-A35 cores (RK3326). Earlier
versions assume ARMv8.1 LSE atomics, which A35 lacks; the process
SIGILLs at startup. Bun 1.3.14 confirmed working on EmuELEC 4.7 /
glibc 2.36 / A35.

Sanity check on the host before shipping:

```sh
patchelf --print-interpreter bun
# → /lib/ld-linux-aarch64.so.1
patchelf --print-needed bun
# → libc.so.6, ld-linux-aarch64.so.1, libpthread.so.0, libdl.so.2, libm.so.6
```

### 2. Build the api with `bun build --target=bun`, not the existing `just build-api` recipe

`just build-api` runs `tsc` + `tsc-alias` and emits ES modules with
`import` references intact — useful for dev introspection, useless for
shipping. The single-file pipeline:

```sh
bun build tools/http/server.ts \
  --target=bun \
  --outfile=out/build/api-bundle.js \
  --external jsonc-parser \
  --external pino-pretty \
  --external thread-stream \
  --define process.env.NODE_ENV='"production"'
```

Result: **~2.56 MB**, 526 modules bundled, 0 runtime `node_modules` deps.

Each `--external` flag exists because of a specific issue:

| Flag | Reason |
|---|---|
| `--external jsonc-parser` | `@proseql/core` does `import pkg from "jsonc-parser"` (default-import), but `jsonc-parser`'s ESM build has no default export. Bun's bundler hard-fails at this; marking it external defers the resolution to the runtime, which then never executes the path for non-jsonc library files. |
| `--external pino-pretty` | The dev-only logger transport. Pulling it into the bundle drags in `thread-stream`'s worker initialization. |
| `--external thread-stream` | Pino's worker-thread machinery records the build-host's absolute path to `worker.js` at module-init time. On the device that path doesn't exist; bun crashes at startup with `ModuleNotFound resolving "/home/.../node_modules/thread-stream/lib/worker.js"`. Marking external and DCE-ing the dev-only transport branch sidesteps it entirely. |

`--define process.env.NODE_ENV='"production"'` enables Bun's dead-code
elimination so the `isDevelopment` branch in
`korri/shared/logger/logger.ts` is removed at bundle time, not just at
runtime — without this, the bundle still inlines pino-pretty
references and the externals don't help.

### 3. Launch with explicit env, write the launcher as a script file, not an inline SSH heredoc

EmuELEC's busybox shell + dropbear-over-SSH does not handle
multi-line inline env-var injection cleanly. The reliable pattern:

```sh
cat <<'EOF' > /storage/launch-korri.sh
#!/bin/sh
pkill -9 -f 'bun.*korri-api' 2>/dev/null
sleep 1
rm -f /storage/bun.log
cd /storage
export PORT=8181 HOST=0.0.0.0 NODE_ENV=production
nohup /storage/bin/bun run /storage/korri-api.bundle.js \
    > /storage/bun.log 2>&1 &
disown 2>/dev/null
EOF
chmod +x /storage/launch-korri.sh
/storage/launch-korri.sh
```

Symptom of doing it inline instead: `bun.log` ends up empty or the
process gets killed on SSH disconnect, and `pgrep -af bun` shows only
the SSH wrapper's shell, not bun itself.

### 4. Effect-RPC wire envelopes have two gotchas when probing manually

```http
POST /api/rpc HTTP/1.1
Content-Type: application/json

{
  "_tag": "Request",
  "id": "1",                ← BigInt-parseable string (NOT "x", "abc")
  "tag": "app.hello.get",
  "payload": {"name": "..."},
  "traceId": "abcdef12",
  "spanId":  "12345678",
  "sampled": true,
  "headers": []             ← ARRAY, not object {}
}
```

`id` must parse as `BigInt`. Sending `"x"` produces
`[{"_tag":"Defect","defect":{"message":"Failed to parse String to BigInt"}}]`.

`headers` must be an array. Sending `{}` triggers the envelope
guard added in commit `d441e37` (`feat(api): harden /api/rpc
against malformed wire envelopes`), responding with
`Bad Request: Request.headers must be an array when present`.

The `tag` must come from `appRpcGroup` (at `korri/products/app/api/app-rpc-group.ts`),
**not** `serverRpcGroup` (at `korri/products/app/api/server/rpc-group.ts`).
The api server mounts the former — the latter is for the `korri-server`
daemon (`tools/device/korri-server.ts`). `app.server.status` lives only
on the server group; from the api you get `Unknown request tag`.

### 5. The bundled api inherits the full KORRI runtime — including federation

With no extra env, `app.library.list` on the device returns games
federated from other KORRI hosts on the LAN (Avahi/mDNS via
`bonjour-service` + `@app/peers/peer-discovery`). Example output from
R36T MAX (`192.168.1.227`), no local sources configured:

```json
{
  "games": [
    {"id":"celeste-classic", "source":{"hostId":"sobo","controlUrl":"http://192.168.1.239:3001"}},
    {"id":"picohot",          "source":{"hostId":"sobo","controlUrl":"http://192.168.1.239:3001"}},
    {"id":"nixpkgs/neverball","source":{"hostId":"aka","controlUrl":"http://192.168.1.117:3001"}}
  ]
}
```

This means: as soon as the bundle runs, the device is a participating
KORRI peer. No extra config needed. If you don't want federation,
set `KORRI_FEDERATION_DISABLE=1` or similar before launch.

## Why This Matters

- **Same artifact for every aarch64 handheld.** The bundle and the
  Bun binary are arch-only, not distro-specific. They run on EmuELEC,
  ROCKNIX, Batocera, ArkOS — every Linux glibc 2.27+ aarch64 device
  KORRI cares about today.
- **No `node_modules` on device, ever.** Removes 2.4 GB of overhead
  and the entire "did npm install run correctly on the handheld?"
  category of failure. Ship one .js file plus one binary.
- **Bun's runtime is genuinely lean** on aarch64 — 36 MB RSS at idle
  for `Bun.serve()`, 99 MB RSS with the full KORRI api stack loaded
  (Hono + Effect + RPC + federation + ProseQL). Leaves room for the
  compositor + Mali userspace + portal renderer in the same 970 MB
  RAM envelope (see Related).
- **Bundling correctness is the real puzzle.** Without the three
  `--external` flags + `--define NODE_ENV`, the bundle crashes
  immediately on the device with errors that look like bun bugs but
  are upstream library quirks. The recipe above is the minimum that
  works against the current dep graph.

## When to Apply

- Shipping any KORRI api / RPC artifact to a stock-OS aarch64 handheld.
- After upgrading any dependency that changes the pino, thread-stream,
  or @proseql/core layout — re-validate the externals list.
- Validating B3 ("KORRI runtime executes on the device") from the
  staged-layer-adoption framing.
- Debugging `Bad Request: Request.headers must be an array` or
  `Failed to parse String to BigInt` from curl-driven RPC tests —
  this is wire format, not server code.

## Examples

### End-to-end success on R36T MAX

```text
$ ssh device /storage/launch-korri.sh
{"level":30,"msg":"HTTP server listening on http://0.0.0.0:8181"}

$ curl -sX POST http://192.168.1.227:8181/api/rpc \
    -d '{"_tag":"Request","id":"1","tag":"app.hello.get",
         "payload":{"name":"KORRI on R36T MAX"},
         "traceId":"abcdef12","spanId":"12345678",
         "sampled":true,"headers":[]}'
[{"_tag":"Exit","requestId":"1","exit":{"_tag":"Success",
  "value":{"message":"Hello, KORRI on R36T MAX. Effect RPC is ready.",
           "timestamp":"2026-05-28T00:09:47.032Z"}}}]

Resources while running:
  Bun RSS:       99 MB
  VSZ:           71 GB (V8/JSC virtual reservation — not RAM)
  RAM available: 784 MB
  System load:   0.24  (4-core A35)
  Disk:          /storage 2.0 G / 3.7 G (55%)
```

### Failure mode: skipping `--external thread-stream`

```text
error: ModuleNotFound resolving
  "/home/simonwjackson/code/sandbox/korri/node_modules/thread-stream/lib/worker.js"
  (entry point)
  at /storage/korri-api.bundle.js:16184
error: the worker thread exited
Bun v1.3.14 (Linux arm64)
```

The bundler embedded the build-host's absolute `worker.js` path.
Fix: re-bundle with `--external thread-stream --define
process.env.NODE_ENV='"production"'`.

### Failure mode: wrong RPC envelope

```text
$ curl -sX POST .../api/rpc \
    -d '{"_tag":"Request","id":"x","tag":"app.hello.get","payload":{},
         "traceId":"t","spanId":"s","sampled":true,"headers":{}}'
[{"_tag":"Defect","defect":{"message":"Failed to parse String to BigInt"}}]
```

Two bugs in one envelope: `id` is not BigInt-parseable, `headers` is
an object. Fix both: `"id":"1"` and `"headers":[]`.

## Related

- `docs/solutions/best-practices/wayland-userspace-on-mali-g31-handheld-via-newer-libmali-2026-05-27.md` — the compositor + Mali stack this api server shares 970 MB RAM with on the same device.
- `docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md` — B3 (Bun + KORRI runtime) in the staged-layer-adoption framing; this recipe is the concrete validation point.
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` — sibling guest-only deploy pattern; the bun bundle is the no-nix-needed version of the same idea.
- `korri/products/app/api/app-rpc-group.ts` — the actual mounted RPC group; tags here are what the bundled api answers.
- Recent commits worth noting: `d441e37` (`feat(api): harden /api/rpc against malformed wire envelopes`) and `d679e0e` (`fix(api): normalize RPC headers to sidestep RpcServer concat-undefined crash`) — both are why the envelope guards exist.
