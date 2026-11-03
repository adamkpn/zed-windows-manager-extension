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

```bash
make install build-dist   # npm ci + ray build into dist/
```

Then **Tinycast Settings → Extensions → Install New → Add from folder** and pick `dist/`. For development in Raycast, `make dev`.

## Preferences

| Preference      | Default                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| Path to Zed CLI | `zed` from /opt/homebrew/bin, /usr/local/bin, PATH, then Zed.app's `cli`     |
| Zed Database    | `~/Library/Application Support/Zed/db/0-stable/db.sqlite` (`0-preview` for Zed Preview) |

The droplet reads `ZED_CLI` and `ZED_DB` from the environment for the same overrides.

## Development

```bash
make            # list targets
make verify     # build, typecheck, lint, test
make test       # unit tests, including droplet/zed-open.sh against a fixture database
make droplet    # rebuild the droplet after editing droplet/
```

`ray lint` reports `Invalid author "adamkpn"` because that handle isn't a Raycast Store user. That only matters for publishing to the Store.

## Privacy

Everything runs locally. The extension only reads Zed's database and each folder's `.git/HEAD`, and it doesn't make any network calls. The droplet's only network access is `git pull` for folders that aren't open yet.
