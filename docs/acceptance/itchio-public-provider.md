# itch.io acquisition provider

Korri's built-in `@korri:itchio` provider supports unauthenticated public discovery, metadata, download resolution, and acquisition staging for itch.io pages. Optional authentication adds official API-backed owned-library discovery and owned-upload download resolution without changing the public path.

## Supported without credentials

- Search public browse RSS feeds for tag/free/platform queries.
- Fall back to public itch.io search result pages for natural-language queries.
- Fetch public page details and `data.json` display metadata when available.
- Resolve clearly free public downloadable uploads to short-lived final artifact URLs.
- Stage resolved public downloads through acquisition-owned content-addressed staging.
- Resolve and stage user-entitled itch.io download-key pages when Korri can fetch the download page directly.
- Represent browser-playable games as HTML metadata for future native container support; browser-only pages are not final artifacts.
- Optionally use `ITCHIO_API_KEY` for official API-backed profile games and owned-library discovery.

## Optional authentication

Authentication is optional and remains part of the single `@korri:itchio` provider. Configure an official itch.io API key with:

```bash
ITCHIO_API_KEY=... bun product/apps/cli/korri-cli.ts bazzar validate-providers --providers @korri:itchio
```

With a valid API key, the provider can query official `api.itch.io` endpoints such as `/credentials/info`, `/profile/games`, and `/profile/owned-keys`. Use the special search query `profile:games` to list games uploaded by, or editable by, the authenticated account:

```bash
ITCHIO_API_KEY=... bun product/apps/cli/korri-cli.ts bazzar search profile:games \
  --providers @korri:itchio \
  --format json
```

Use the special search query `profile:owned` to list games the authenticated account has purchased or claimed:

```bash
ITCHIO_API_KEY=... bun product/apps/cli/korri-cli.ts bazzar search profile:owned \
  --providers @korri:itchio \
  --format json
```

For a paid page with authenticated ownership, `resolve-download` first tries the long-term official API path: prove ownership, list uploads, and resolve a selected upload through the authenticated upload download API when itch.io exposes uploads for that account/game:

```bash
ITCHIO_API_KEY=... bun product/apps/cli/korri-cli.ts bazzar resolve-download @korri:itchio https://creator.itch.io/game \
  --title 'Owned Game' \
  --file-name 'Linux build.zip'
```

Tokens are passed only via the `Authorization: Bearer` header and are redacted from provider errors. Owned-library responses may include download keys; those keys are treated as entitlement secrets and are not emitted in claims, non-final outcomes, or staged artifact metadata. Live validation showed `profile:owned` works for player-owned games, while direct upload listing can return an empty upload set for purchased games; those cases remain non-final without a browser URL for `resolve-download`, and `acquire` can fall back to a Korri-owned butlerd subprocess. Butlerd uses API-key login, `Fetch.DownloadKeys`, `Fetch.GameUploads`, `Install.Queue`, and `Install.Perform`, then returns a tar.gz of the installed folder with `.itch` receipt metadata excluded.

A valid key with no uploaded/editable games is still healthy: `profile:games` may return `No results found` for non-developer/player-only accounts. `profile:owned` may similarly return no claims for accounts with no purchased/claimed games. Invalid or revoked keys make provider validation return a configuration error.

## Safe non-final states

The provider intentionally returns `requires-user-action` instead of a final artifact for:

- Paid pages without configured ownership credentials or a fetchable user-entitled download-key page.
- Owned/auth-required pages that require an interactive account session before their download page or authenticated upload resolution is available.
- Ambiguous multi-upload pages without a unique hint.
- Upload choices that do not match the requested hint.
- Private, credentialed, malformed, or otherwise unsafe final URLs.
- Browser-only pages that do not expose a downloadable upload.

When a multi-upload page is ambiguous, `resolve-download` includes safe upload choices so callers can retry with `--file-name`, `--size`, or `--artifact-format`. For user-entitled download-key URLs, non-final outcomes do not echo the keyed URL.

## CLI examples

Search public itch.io results:

```bash
bun product/apps/cli/korri-cli.ts bazzar search 'slide in the woods' \
  --providers @korri:itchio \
  --platforms windows \
  --format json
```

Inspect details:

```bash
bun product/apps/cli/korri-cli.ts bazzar details @korri:itchio:jonnys-games/slide-in-the-woods
```

Resolve a public multi-upload with an explicit choice:

```bash
bun product/apps/cli/korri-cli.ts bazzar resolve-download @korri:itchio https://leafo.itch.io/x-moon \
  --title X-Moon \
  --file-name xmoon.love
```

Resolve a user-entitled download-key page without echoing the key in non-final output:

```bash
bun product/apps/cli/korri-cli.ts bazzar resolve-download @korri:itchio https://creator.itch.io/game/download/DOWNLOAD_KEY \
  --title 'Owned Game' \
  --file-name 'Linux build.zip'
```

Stage a resolved public, user-entitled, authenticated owned, or butlerd-installed artifact without writing library records:

```bash
KORRI_ACQUISITION_STAGING_ROOT=/tmp/korri-acquisition \
  bun product/apps/cli/korri-cli.ts bazzar acquire @korri:itchio https://leafo.itch.io/x-moon \
  --file-name xmoon.love
```

## Official API capability boundary

Download-key URLs are treated as user-provided entitlement material. Korri can parse upload choices and acquire artifacts from them when the page is directly fetchable. Some account-linked purchase URLs redirect to login unless an itch.io session is available; authenticated owned-library API resolution is preferred before considering any session fallback.

The official server-side API currently documents:

- `GET /credentials/info` for credential validation.
- `GET /profile` for the authenticated user's public profile.
- `GET /profile/games` for games the authenticated account uploaded or can edit.
- `GET /profile/owned-keys` for games the authenticated account has purchased or claimed, granted by the documented `profile:owned` OAuth scope.
- Authenticated game-upload listing and upload-download resolution used by the itch app/butler API surface.
- `GET /games/GAME_ID/download_keys` and `GET /games/GAME_ID/purchases` for creator-side purchase/download-key verification for a game id returned by `/profile/games`.
- `GET /wharf/latest` for latest build user-version metadata.

The creator-side `games/GAME_ID/download_keys` and `games/GAME_ID/purchases` endpoints remain verification tools for games the account owns/edits. Player-owned acquisition uses the owned-library API path first: list owned keys, try to list uploads for the owned game, then resolve the selected upload to a short-lived final artifact URL if the API exposes one. Korri therefore keeps paid, claim-required, captcha, and authenticated artifact downloads non-final when the owned-library path cannot prove entitlement or cannot resolve a final artifact.

The provider does not scrape credentials or browser cookies. Butlerd fallback runs as a Korri-owned subprocess with a temporary local db path, no request logging, explicit shutdown, and staged folder/archive metadata that excludes API keys, download keys, receipt secrets, and signed URLs. Configure a non-default butler command with `ITCHIO_BUTLER_COMMAND` as a JSON string array, for example `["nix","run","nixpkgs#butler","--"]`, or set `ITCHIO_BUTLER_BIN` to a butler executable path.
