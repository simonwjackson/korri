# Legacy readable schema Rust port trace

Status: U2 implementation trace for `work/items/active/01KYZ7E2VY1HA5F878BBJQFE6K-config-route-android-launch/plan.md`.

Grounding revision: `0e4cec9da3d77e6578b8a01a5d83420ba0d98e62`.

This document traces the Rust production decoder in `services/korrid/src/config/` to the unchanged legacy readable contract. It is intentionally a schema/support trace only: snapshot loading, route resolution, plugin policy, and Android launch mapping remain deferred to later units.

## File boundary

| Fixed file | Accepted sections | Rust enforcement | Legacy source |
| --- | --- | --- | --- |
| `config.yaml` | `host`, `storage`, `providers`, `provider-links`, `systems`, `launchers`, `runtimes`, `profiles`, `hooks` | `decode_config_pair` rejects any library-owned section in the config document before publishing the pair. | `product/platform/library/proseql/library-db-core.ts` `collectionsSchema`; plan file-ownership matrix |
| `library.yaml` | `collections`, `users`, `library` | `decode_config_pair` rejects any config-owned section in the library document before publishing the pair. | `product/platform/library/proseql/library-db-core.ts` `collectionsSchema`; plan file-ownership matrix |

The Rust pair decoder also keeps the legacy plain singleton `host:` boundary instead of persisting `host.local`.

## Section and field trace

| Section | Persisted shape and fields | Identity rule | Rust schema/support status | Legacy source/test/fixture |
| --- | --- | --- | --- | --- |
| `host` | Plain singleton block. Fields: `title`, `launch`, `moonlight`, `preferences`, `plugin`, `env`, `cwd`, `argsAppend`, `patches`, `hooks`. Host `hooks` additionally accepts `trust-removable`. | Singleton local host; no persisted key. | Schema-decodable. `title` is retained metadata. Every populated behavior field is classified unsupported in U2. | `records/host.ts`; `records/readable-schema.test.ts`; `fixtures/hooks.korri.yaml`; checkpoint `config.yaml` |
| `storage` | Map of payloads with `root` and optional `path` string map. | Map key is the storage id; key and string values must be non-empty. | Schema-decodable. Any populated record is unsupported in U2. | `records/storage.ts`; `records/readable-schema.test.ts`; `fixtures/steam-full.korri.yaml` |
| `providers` | Map of payloads with optional `title`; legacy `kind` is rejected. | Map key must be a provider id like `@korri:steam`. Body does not carry `id`. | Schema-decodable. Provider id/title are retained for later route composition. `kind` is schema-invalid, matching legacy. | `records/provider.ts`; checkpoint README/plugin validation |
| `provider-links` | Map of payloads with `provider`, `playable`, optional `release`, and non-empty `refs[]`; ref fields are `kind`, `value`, optional `scope`, optional `targetPart`. | Map key is non-empty. `provider` uses provider-id syntax; `playable` uses playable-id syntax. | Schema-decodable. Any populated record is unsupported in U2. | `records/provider-link.ts`; `records/library-item.ts` source-removal diagnostics |
| `systems` | Map of payloads with optional `name`, `title`, `manufacturer`, `aliases`, `metadata`. | Map key is the system id and must be non-empty. Body does not carry `id`. | Schema-decodable. ID/title/name metadata are retained for later route composition; other metadata remains declaration data only. | `records/system.ts`; `records/system.test.ts`; `fixtures/steam-full.korri.yaml` |
| `launchers` | Map of app payloads with optional `settings`, `plugin`, `command`, `runtime`, `args`, `systems`, `policy.allowedCommands`, `inherit`, `presets`, and inheritable behavior fields. | Map key is the launcher id and must be non-empty. Body does not carry `id`; `plugin` is a provider id when present. | Schema-decodable. Android plugin/command/system selection is retained for later route composition; actual executability is later route-level policy. | `records/app.ts`; `records/app.test.ts`; `fixtures/steam-full.korri.yaml`; checkpoint plugin source |
| `runtimes` | Map of payloads with `kind` (`libretro-core`, `tool`, `emulator`), absolute `path`, optional `title`, `tool`, `app`, `supports.systems`, and inheritable behavior fields. | Map key is non-empty. Body does not carry `id`. | Schema-decodable. Any populated record is unsupported in U2. | `records/runtime.ts`; `records/readable-schema.test.ts`; `fixtures/steam-full.korri.yaml` |
| `profiles` | Map of payloads with optional `title`, `app`, `runtime`, and inheritable behavior fields. | Map key is non-empty. Body does not carry `id`. | Schema-decodable. Any populated record is unsupported in U2. | `records/profile.ts`; `config/readable-cascade-resolver.test.ts` |
| `hooks` | Map of hook profiles with optional `before[]` and `after[]`. `before` steps carry `run`, optional `name`, `timeout`, and `on-failure: abort|warn`; `after` steps carry `run`, optional `name`, `timeout`. | Map key is non-empty. Body does not carry `id`. | Schema-decodable. Any populated record is unsupported in U2. Unknown step fields and after-step `on-failure` are rejected. | `records/hook-profile.ts`; `records/readable-schema.test.ts`; `fixtures/hooks.korri.yaml` |
| `collections` | Map of payloads with optional `title`, `description`, `items`, `inherit`, `presets`, `byLauncher`, and collection-scoped `launch`, `env`, `cwd`, `argsAppend`. | Map key is non-empty. `items[]` use playable-id syntax. Body does not carry `id`. | Schema-decodable. Any populated record is unsupported in U2. | `records/collection.ts`; `records/library-item.test.ts` |
| `users` | Map of payloads with optional `displayName`, `favorites`, `hidden`, `launch`, `launcher`, `inherit`, `presets`, `byLauncher`, and inheritable behavior fields. | Map key is non-empty. `favorites[]` and `hidden[]` use playable-id syntax. Body does not carry `id`. | Schema-decodable. Any populated record is unsupported in U2. | `records/user.ts`; `records/library-item.test.ts` |
| `library` | Map of library item payloads with optional `title`, `version-of`, `relation`, `collections`, `display`, `metadata`, `userData`, `contains`, required non-empty ordered `releases[]`, and inheritable behavior fields. Removed `source` is rejected. Releases carry `id`, `system`, optional `target`, `identity`, `display`, `launch`, and inheritable behavior fields; removed `source`, `app`, `runtime`, and `apps` are rejected. | Map key and release ids use local playable-id syntax. `contains` keys use local playable-id syntax. Cross-playable references use playable-id syntax. Release ids are unique per item. | Schema-decodable. Checkpoint `title` plus release `system`, provider-ref target, and `launch.use` are supported; relationship/metadata/contains/inheritable/launch override fields are explicitly unsupported in U2. Non-provider-ref route variants decode but remain for later route-level diagnostics. | `records/library-item.ts`; `records/library-item.test.ts`; `fixtures/steam-full.korri.yaml`; checkpoint `library.yaml` |

## Shared nested vocabulary

| Nested shape | Fields | Rust behavior | Legacy source |
| --- | --- | --- | --- |
| Provider id | `@namespace:name`; lowercase/digit start, then lowercase letters, digits, `.`, `_`, `-` | Required for provider keys, provider references, plugin/app kind fields, and provider-keyed policy maps. | `records/provider.ts`; `inheritable-fields.ts` |
| Playable id | `<item-id>` or `<item-id>/<contained-id>`; each segment is lowercase/digit start, then lowercase letters, digits, `.`, `_`, `-`; `.` and `..` are invalid. | Required for library keys, contained keys, user favorites/hidden, collection items, and version references. | `config/playable-id.ts` |
| Target | `file`, `file-set`, `executable`, `url`, `provider-ref` tagged by `kind`; file/file-set/executable/url paths must be non-empty and non-absolute. | Strictly decoded. `provider-ref` is the supported checkpoint route shape; others remain schema-valid route-level work. | `records/library-item.ts`; `records/library-item.test.ts` |
| Launch selection | Release `launch.use`, `launch.plugin`, `launch.runtime`, `launch.input`, `launch.settings`, `launch.with`, `launch.env`, `launch.cwd`, `launch.argsAppend`, `launch.overrides`. | `use` and `plugin` together are schema-invalid. `use` alone is supported for the checkpoint; every other populated launch subfield is classified unsupported in U2. | `records/library-item.ts`; `records/readable-schema.test.ts` |
| Inheritable fields | `launch`, `moonlight`, `preferences`, `plugin`, `env`, `cwd`, `argsAppend`, `patches`, `hooks` on legacy layer-bearing records. | Strict field names, explicit-null rejection, and support classification. Opaque plugin/moonlight payloads remain values because legacy carries them opaquely. | `config/inheritable-fields.ts`; `config/streamer-policy.ts`; `records/readable-schema.test.ts` |

## Conformance fixtures

Checked-in Rust fixtures under `services/korrid/tests/fixtures/legacy-readable/` harvest only grounded legacy values:

- `config-all-sections.yaml`: values from `fixtures/steam-full.korri.yaml`, `fixtures/hooks.korri.yaml`, and record test/source examples for `host`, `storage`, `providers`, `provider-links`, `systems`, `launchers`, `runtimes`, `profiles`, and `hooks`.
- `library-all-sections.yaml`: values from `fixtures/steam-full.korri.yaml` and record test/source examples for `collections`, `users`, and `library`.
- The exact Android checkpoint pair remains in `docs/research/android-app-plugin-schema-checkpoint/` and is consumed directly by `services/korrid/tests/config_schema.rs`.

The conformance tests exercise the public production decoder (`decode_config_pair`) rather than a diagnostics-only parser.

## U2 implementation-time decisions

- Rust validates provider map keys even though legacy's pre-ProseQL strict helper validates provider payloads first; this preserves the key-derived identity contract the persisted collection ultimately relies on and satisfies the plan's malformed-provider-id rejection requirement.
- `serde_yaml` is added as a direct dependency because U2's public decoder must consume grounded YAML fixtures before the proseQL loader lands in U3. The package was already present in `Cargo.lock` through proseQL; this makes the dependency explicit for Korri's production decoder.
- Support classification is intentionally separate from schema decoding. Schema-valid legacy records can be decoded and then rejected as unsupported with field paths instead of being silently dropped or mislabeled as malformed YAML.
