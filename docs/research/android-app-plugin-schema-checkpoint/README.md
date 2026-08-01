# Android application plugin schema checkpoint

Status: passed

This checkpoint asks one question before the Rust port begins:

> Can the installed Android application already used by Korri be represented by
> the legacy persisted schema and plugin contribution seam without altering the
> schema?

The answer is **yes**. The files beside this document are the exact reviewed
inputs:

- `config.yaml` — trusted device configuration;
- `library.yaml` — the TMNT library record;
- `android-app.plugin.ts` — the declaration-only plugin contribution;
- `validate.sh` and `validate-legacy.ts` — the reproducible validation harness.

They are design fixtures, not production configuration wired into korrid.

## Result

The unchanged legacy strict schema accepted both YAML documents. The unchanged
legacy plugin registry accepted the evaluated plugin declaration, and the
unchanged readable cascade resolver selected this launch context:

```text
plugin                 @korri:android-app
provider               @korri:android-app
system                 android
launcher               @korri:android-app/android-app
launcher kind          @korri:android-app
integration token      android-app
playable               tmnt-shredders-revenge
release                android
resolved target        @korri:android-app:com.playdigious.tmnt
```

No persisted-schema change is required for this case.

## Grounding

Nothing in the fixture introduces a new persisted vocabulary.

| Fixture value or shape | Existing source |
| --- | --- |
| `tmnt-shredders-revenge`, display title, `com.playdigious.tmnt` | Current hardcoded Android application record in `services/korrid/src/launcher/android_app.rs` |
| `android-app` integration token | Current signed `LaunchSpec.launcher_id` and Android shell handling |
| `android` system id | Legacy's existing Android platform normalization and its unconstrained system-id record |
| `@korri:android-app` | Legacy provider/plugin identity syntax |
| Plugin-contributed provider, system, and launcher | Legacy `PluginConfigContributions` and first-party plugin definitions |
| `target.kind: provider-ref` | Legacy `LibraryReleasePayload`; the package name is the provider-owned reference, analogous to Steam's provider-owned app id |
| `launch.use` | Legacy release-to-launcher selection |
| `host.title` | Legacy host payload; `usu` is the real device name |
| Fixed `config.yaml` and `library.yaml` | The explicitly chosen checkpoint storage shape; both remain parts of one logical legacy schema |

The plugin contributes the provider, system, and launcher. They are not copied
into `config.yaml`; otherwise disabling the plugin could leave a persisted
launcher behind and invalidate the later architecture proof.

## What `command: android-app` means

Legacy's app record requires a command before a custom app can be resolved.
Here `android-app` is not an executable name. It is the integration token
already present in the current launch treaty. A provider-qualified Android
launch integration must consume it. It must never fall through to generic
process execution.

## Remaining implementation gap

Schema acceptance and route resolution do not perform an Android launch. The
future Android launch integration still has to:

1. require the selected app kind to be `@korri:android-app`;
2. recover the package name from the legacy resolver's flattened target by
   requiring and removing the complete `@korri:android-app:` prefix—not by
   splitting on `:`, because the provider id itself contains a colon;
3. emit the current exact unsigned launch instruction: launcher
   `android-app`, that package name, empty activity class, extras `{}`,
   directories `[]`, files `[]`, and integrity `""`;
4. let the existing signing and JVM PackageManager edge handle the effect and
   installed-package check.

Until that integration is registered, the provider-qualified route must fail
explicitly rather than run `android-app` as a process.

Plugin enablement and package fulfillability are also deliberately outside the
two persisted documents. The first belongs to device/plugin composition; the
second is Android hardware truth. This checkpoint does not define either
future policy or a federation wire format.

## Validation evidence

Validated against:

- main baseline `c58733d4`;
- legacy schema and resolver at `0e4cec9d`;
- the current Rust TypeScript evaluator in its empty sandbox.

Run the checked-in proof from the repository root:

```sh
docs/research/android-app-plugin-schema-checkpoint/validate.sh
```

The harness evaluates the plugin with current korrid, installs the dependencies
pinned by the archived legacy revision in a temporary directory, passes the
exact YAML through legacy's `validateReadableDocumentStrictly`, normalizes the
evaluated declaration with legacy's `plugin()` and `createPluginRegistry()`,
decodes its contributed provider/system/launcher records, and runs
`resolveReadableLaunchContext` for the TMNT item. It also proves that disabling
the plugin removes its launcher contribution.

Observed result:

```text
plugin disabled removes launcher: PASS
legacy strict schema: PASS
legacy readable context resolver: PASS
```

This proves strict decoding and readable launch-context selection. It does not
claim that legacy's repository can prepare the final `LaunchSpec`: that remains
correctly unavailable until the Android readable launch integration exists.

The exercise also exposed a legacy normalization mismatch: `plugin()`'s
implicit own-provider payload does not itself satisfy the later strict
`ProviderRecord` decoder, whose failures are silently dropped. This fixture
supplies the same provider explicitly with its id so the end-to-end legacy path
is valid. The Rust port must normalize this correctly and fail malformed
provider contributions explicitly; it must not reproduce the silent drop.
