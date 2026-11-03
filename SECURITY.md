# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Don't open a public issue.

## What runs, and with what access

- **Search Zed Windows** runs locally inside Tinycast or Raycast. It reads Zed's state database (`~/Library/Application Support/Zed/db/0-stable/db.sqlite`, read-only, through `/usr/bin/sqlite3`) and each listed folder's `.git/HEAD`. It runs the `zed` CLI and `pgrep` with argument lists, never through a shell, and makes no network calls.
- **Zed Open.app** runs `droplet/zed-open.sh` on the folders it is given. For a folder that isn't open yet, it runs `git pull --ff-only` there. `git pull` runs that repository's local hooks and config, just as it does in a terminal, so only drop folders you trust.

## Releases

Release assets are built by a job with a read-only token. A separate job with no third-party code publishes them, with a SHA-256 file for each asset. `Zed-Open-v*.zip` is ad-hoc signed and not notarized, so build it yourself with `make droplet` if you'd rather not trust a downloaded binary.
