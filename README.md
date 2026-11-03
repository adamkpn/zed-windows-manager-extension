# Zed Windows

Find the [Zed](https://zed.dev) window you already have open instead of opening the project again. Two parts:

- **Search Zed Windows**: a Tinycast/Raycast command listing the open Zed windows, most recently used first. Search by folder name, any part of the path, or git branch, then ↵ to bring that window to the front.
- **Zed Open.app**: a small droplet to use as the "Open with" app in launchers such as the Git Repos extension. If the folder is already open in Zed, it focuses that window. Otherwise it runs `git pull --ff-only` and opens a new window.

## Search Zed Windows

| Key  | Action                       |
| ---- | ---------------------------- |
| ↵    | Focus the window             |
| ⌘⇧,  | Copy the folder path(s)      |
| ⌘⇧F  | Show in Finder               |
| ⌘R   | Refresh                      |

Each row shows the folder name (the window title), the path, and the checked-out branch. The first row, marked **Current**, is the Zed window you used last. Multi-root workspaces list all their roots.

### Hotkey

Extensions can't ship a hotkey, so set one yourself: **Tinycast Settings → Extensions → Zed Windows → Search Zed Windows → Hotkey** (in Raycast, the same place under Extensions).

## Zed Open.app (for Git Repos)

```bash
make droplet   # builds ~/Applications/Zed Open.app
```

Then **Tinycast → Git Repos → Preferences → "Open with (required), shortcut: ⏎"** → pick `~/Applications/Zed Open.app`.

For each folder it receives:

1. **Already open** (it is a root of an open Zed window): run `zed -e <folder>`, which brings that window to the front. No git pull, so nothing changes under work in progress.
2. **Not open**: if the folder is a git work tree, `git pull --ff-only` it (never prompts; SSH gives up after 5 s; a failed pull doesn't block the open), then `zed -n <folder>`.

Launched with no folder, it opens an empty Zed window. It also works from a shell: `~/Applications/Zed\ Open.app/Contents/Resources/zed-open.sh <folder>...`.

Only an exact root counts as open. A window rooted at `~/Repos` doesn't count as `~/Repos/foo` being open, so `~/Repos/foo` gets its own window.

## How it knows what's open

Zed has no API for listing windows, so both parts read Zed's own state database, `~/Library/Application Support/Zed/db/0-stable/db.sqlite`, with the system `sqlite3` in read-only mode:

- `kv_store.session_id` is the running session, and `kv_store.session_window_stack` lists its live window ids in focus order.
- `workspaces` has one row per set of root folders, tagged with the session and window id.

Session rows survive a quit (Zed restores them on launch), so nothing counts as open unless a `zed` process is running. Remote (SSH) projects are skipped.

To focus a window, both parts use `zed -e <folder>`. Plain `zed <folder>` isn't enough: with `"cli_default_open_behavior": "new_window"` in Zed's settings, it ignores windows whose root is that folder and opens a duplicate. `-e` matches exact roots and activates the window, without needing Accessibility permission.

Zed doesn't document this database, so a Zed update could change it. If that happens, the command says it couldn't read the database instead of showing a wrong list.

## Install in Tinycast

- **From GitHub:** Settings → Extensions → Install New → **Install from GitHub**, then enter `https://github.com/adamkpn/zed-windows-manager-extension`.
- **From a release:** download `zed-windows-v*.zip` from [Releases](https://github.com/adamkpn/zed-windows-manager-extension/releases), check it with `shasum -a 256 -c zed-windows-v*.zip.sha256`, unzip it, then **Add from folder** and pick the `zed-windows` folder.
- **From source:** `make install build-dist`, then **Add from folder** and pick `dist/`. For development in Raycast, `make dev`.

The droplet is in each release as `Zed-Open-v*.zip`. It is ad-hoc signed, not notarized, so macOS quarantines the downloaded copy. After unzipping, either run `xattr -dr com.apple.quarantine "Zed Open.app"` or right-click → Open once, then move it to `~/Applications`. `make droplet` builds it locally and avoids the quarantine.

## Preferences

| Preference      | Default                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| Path to Zed CLI | `zed` from /opt/homebrew/bin, /usr/local/bin, PATH, then Zed.app's `cli`     |
| Zed Database    | `~/Library/Application Support/Zed/db/0-stable/db.sqlite` (`0-preview` for Zed Preview) |

The droplet reads `ZED_CLI` and `ZED_DB` from the environment for the same overrides.

## Development

```bash
make            # list targets
make verify     # build, typecheck, ESLint + Prettier, tests, ShellCheck (same as CI)
make test       # unit tests, including droplet/zed-open.sh against a fixture database
make droplet    # rebuild the droplet after editing droplet/
make release-assets VERSION=v1.0.0   # the release zips, locally, into release/
```

`make lint` (`ray lint`) reports `Invalid author "adamkpn"` because that handle isn't a Raycast Store user. That only matters for publishing to the Store, so `verify` and CI run ESLint and Prettier directly.

### CI and releases

- **CI** (`.github/workflows/ci.yml`) runs on every pull request and push to `main`, on `macos-latest`. It runs `npm audit`, `make verify`, and a droplet build with a signature check.
- **Release** (`.github/workflows/release.yml`) runs when you push a `vX.Y.Z` tag. It runs the same checks, then `make release-assets`, then publishes a GitHub Release with both zips and their `.sha256` files. The release notes are the matching `## [X.Y.Z]` section of `CHANGELOG.md`, and the release fails if that section is missing.

  ```bash
  # add a "## [1.1.0] - YYYY-MM-DD" section to CHANGELOG.md, merge to main, then:
  git tag v1.1.0 && git push origin v1.1.0
  ```

- **Dependabot** sends weekly grouped updates for npm packages and the pinned GitHub Actions.

## Privacy

Everything runs locally. The extension only reads Zed's database and each folder's `.git/HEAD`, and it doesn't make any network calls. The droplet's only network access is `git pull` for folders that aren't open yet.
