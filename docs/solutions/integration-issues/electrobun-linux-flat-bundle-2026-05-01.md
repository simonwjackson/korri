---
module: korri/deploy/desktop + nix/korri-desktop.nix
date: 2026-05-01
problem_type: integration_issue
component: tooling
severity: high
symptoms:
  - "`bun x electrobun build` prints `Bundle failed` and exits non-zero on Linux"
  - "Resulting `out/build/electrobun/<env>-linux-<arch>/<app>/Resources/app/` directory is empty"
  - "`nix run` launches the native wrapper but the GUI window never appears"
  - "Launcher logs show `[LAUNCHER] Loading app code from flat files` followed by silence"
  - "`Failed to read version.json ENOENT: ../Resources/version.json` after the launcher reaches Bun"
root_cause: incomplete_setup
resolution_type: tooling_addition
related_components:
  - development_workflow
  - testing_framework
tags:
  - electrobun
  - nix
  - nixos
  - desktop
  - packaging
  - patchelf
  - launcher
  - bundle
---

# Electrobun Linux build emits an incomplete flat bundle inside Nix sandbox

## Problem

`electrobun build` (v1.16.0) fails on Linux with a generic `Bundle failed` after creating the directory layout but before emitting `Resources/app/bun/index.js`, `Resources/version.json`, and `Resources/build.json`. The Nix derivation that wraps `electrobun build` therefore ships an unrunnable bundle: the native launcher starts, the patched GTK/WebKit closure loads, but there is no app code or runtime metadata for the embedded Bun worker to execute.

## Symptoms

- `bun x electrobun build` exits 1 with only `Using config file: electrobun.config.ts`, `Using GTK-only native wrapper for Linux`, `Bundle failed`. No `printBuildLogs` output reaches the user.
- The dev bundle directory `out/build/electrobun/dev-linux-x64/<App>-dev/` exists with `bin/launcher`, `bin/bun`, `bin/libNativeWrapper.so`, `Info.plist`, and `Resources/main.js`, but `Resources/app/` is missing.
- `nix run github:<acct>/<repo>#default` (or `git+ssh://...#default`) reaches:
  ```text
  [LAUNCHER] Loading app code from flat files
  === ELECTROBUN NATIVE WRAPPER VERSION 1.0.2 === GTK EVENT LOOP STARTED ===
  ```
  then either prints nothing further (no app code) or fails with:
  ```text
  Server started at http://localhost:50000
  Failed to read version.json ENOENT: no such file or directory, open '../Resources/version.json'
  ```
- After supplying app code, `Failed to read version.json` blocks Bun's `Updater.getLocallocalInfo()` call inside `BrowserView`/`Updater` and the embedded Bun worker exits before opening a `BrowserWindow`.

## What Didn't Work

- **Treating `Bundle failed` as recoverable and shipping the existing dev tree.** The unpacked bundle is missing both app code and runtime metadata; the launcher will not produce a window without them.
- **Re-running `bun x electrobun build` after a prior failed run.** Subsequent runs hit `EACCES: permission denied, rm` because the previous run wrote read-only files in the build folder. This is a side effect, not the root cause.
- **Renaming the desktop entrypoint to `main.ts`.** Electrobun's Linux launcher loads flat-file app code from `Resources/app/bun/index.js` exclusively. `Bun.build({ entrypoints: ['main.ts'] })` emits `main.js`, so the worker spawn target does not exist even when bundling succeeds.
- **Setting GTK/WebKit env vars (`GDK_BACKEND`, `WEBKIT_DISABLE_DMABUF_RENDERER`, `GSK_RENDERER=cairo`) only.** These help compositor compatibility once the app actually runs, but they cannot work around a missing `Resources/app/bun/index.js`.
- **Adding `libsoup_3` and `stdenv.cc.cc.lib` to the runtime closure only.** Necessary for `libNativeWrapper.so` to `dlopen` cleanly, but again does not address the missing flat bundle.

## Solution

Make the Nix derivation tolerant of Electrobun's `Bundle failed` exit and reconstruct the missing flat-bundle pieces ourselves before wrapping the launcher. Two changes:

1. **Provide a flat-bundle entrypoint named `index.ts`** so Bun-driven bundles emit `index.js`:

   ```ts
   // korri/deploy/desktop/index.ts
   import "./main"
   ```

   ```ts
   // electrobun.config.ts
   build: {
     bun: {
       entrypoint: "korri/deploy/desktop/index.ts",
     },
     // ...
   }
   ```

2. **Backfill the bundle inside the derivation** when `electrobun build` produces a partial tree:

   ```nix
   # nix/korri-desktop.nix (excerpt)
   buildPhase = ''
     # ...
     node node_modules/electrobun/bin/electrobun.cjs build || {
       if [ -d out/build/electrobun ]; then
         echo "Electrobun artifact bundling failed, but build output exists; continuing with the unpacked desktop bundle" >&2
       else
         exit 1
       fi
     }

     app_bundle="$(find out/build/electrobun -path '*/Korri-dev' -type d | head -n 1)"
     if [ -z "$app_bundle" ]; then
       echo "Could not find unpacked Electrobun app bundle" >&2
       exit 1
     fi

     if [ ! -f "$app_bundle/Resources/app/bun/index.js" ]; then
       mkdir -p "$app_bundle/Resources/app/bun" "$app_bundle/Resources/app/views/mainview"
       bun build korri/deploy/desktop/index.ts --target bun --outdir "$app_bundle/Resources/app/bun"
       cp -R out/build/portal/. "$app_bundle/Resources/app/views/mainview/"
     fi

     if [ ! -f "$app_bundle/Resources/version.json" ]; then
       cat > "$app_bundle/Resources/version.json" <<'EOF'
   {"version":"1.0.0","hash":"dev","channel":"dev","baseUrl":"","name":"Korri","identifier":"dev.korri.desktop"}
   EOF
     fi

     if [ ! -f "$app_bundle/Resources/build.json" ]; then
       cat > "$app_bundle/Resources/build.json" <<'EOF'
   {"defaultRenderer":"native","availableRenderers":["native"],"runtime":{},"bunVersion":"1.3.9"}
   EOF
     fi
     # patchelf and wrapProgram steps follow ...
   '';
   ```

After both changes, the package contains:

```text
Resources/app/bun/index.js
Resources/app/views/mainview/index.html
Resources/version.json
Resources/build.json
```

`nix run` reaches `[LAUNCHER] Loaded identifier: <id>, name: <name>, channel: dev` and proceeds to the loopback HTTP server + `BrowserWindow`.

## Why This Works

- **`index.ts` matches the launcher contract.** Electrobun's prebuilt Linux launcher (under `Resources/main.js`) hard-codes `Resources/app/bun/index.js` as the worker entrypoint when ASAR is disabled. Bundling from `index.ts` produces `index.js`; bundling from `main.ts` produces `main.js`, which the launcher will not load.
- **The Bun.build step the upstream CLI runs is independently reproducible.** When `electrobun build` fails late (during ASAR/tar/version-hash steps that don't apply to a Nix-built dev bundle), the actual code transpilation step we need (`Bun.build({ entrypoints: [...], target: 'bun' })`) is the same shape we can run ourselves directly. Re-running it produces the file the launcher expects.
- **`version.json` and `build.json` are read at runtime by `Updater.getLocallocalInfo()` and `BuildConfig.get()`.** They contain channel/identifier/runtime info that the embedded Bun worker uses before creating any window. Missing files cause an unhandled exception that aborts startup before the loopback server's `BrowserWindow` call.
- **`channel: "dev"` keeps the Updater on the no-update path.** A `dev` channel skips remote update probing, so the dev-style flat bundle remains self-contained for `nix run`.

## Prevention

- **Always supply a flat-bundle entrypoint named `index.ts` for Linux/Electrobun apps.** Add a `*.test.ts` smoke that asserts `electrobun.config.ts` `build.bun.entrypoint` resolves to a file whose basename is `index.ts`. This stops a future rename from silently regressing `nix run`.
- **Add a derivation-level postcondition that the wrapped app bundle contains the four critical files.** Cheap shell asserts catch upstream regressions or contract drift before the artifact ships:

  ```bash
  for required in \
    "Resources/app/bun/index.js" \
    "Resources/app/views/mainview/index.html" \
    "Resources/version.json" \
    "Resources/build.json"; do
    if [ ! -f "$app_bundle/$required" ]; then
      echo "Missing required Electrobun bundle file: $required" >&2
      exit 1
    fi
  done
  ```

- **Treat any non-fatal Electrobun stderr line containing only `Bundle failed` as a tolerated upstream artifact, not a green build.** The Nix derivation should keep its own `if missing: backfill` step until upstream surfaces the underlying `printBuildLogs` output (Electrobun's prebuilt CLI strips them before exit).
- **When debugging a future Linux Electrobun launch failure, check this order:** (1) `ldd <launcher>` and `<libNativeWrapper.so>` for missing libs in the Nix closure, (2) `Resources/app/bun/index.js` exists, (3) `Resources/version.json` and `Resources/build.json` exist, (4) `bun x electrobun --help` works under the dev shell's patcher. Earlier steps mask later failures.
- **CI should run `nix build .#korri-desktop` and assert all four required files exist in the derivation output.** The existing `desktop-stage2.yml` CI workflow is the right place to add this assert.

## Related Issues

- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` — separate but related: the loopback HTTP composition that the launched window must talk to. This bundle work is what makes that composition reachable from `nix run`.
- `../../../work/.archive/01KQDTYV07RF4XA01AVGR2DBCN-feat-electrobun-nix-native-build/plan.md` — origin plan that delivered the hermetic `nix run` derivation.
- Upstream contract: `node_modules/electrobun/dist/main.js` (launcher worker spawn path), `node_modules/electrobun/dist/api/bun/core/Updater.ts` `getLocallocalInfo`, `node_modules/electrobun/dist/api/bun/core/BuildConfig.ts` `get`.
- External: `https://github.com/blackboardsh/electrobun` — track future releases that may surface Bun.build logs on `Bundle failed` and revisit this workaround.
