#!/bin/sh
# Open folders in Zed, reusing the window that already has the folder open.
#
#   zed-open.sh <folder>...   focus the Zed window whose root is <folder>;
#                             otherwise `git pull --ff-only` it and open a new window
#   zed-open.sh               open an empty new window
#
# Bundled into "Zed Open.app" (see `make droplet`) so launchers such as the
# git-repos extension can use it as their "Open with" app.
#
# Environment (all optional):
#   ZED_CLI   path to the zed CLI (default: zed on PATH, then Zed.app's cli)
#   ZED_DB    Zed's workspace database (default: the 0-stable channel)
#   ZED_OPEN_ASSUME_RUNNING=1  skip the "is Zed running" check (tests)

set -u

PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

SQLITE=/usr/bin/sqlite3
ZED_DB=${ZED_DB:-"$HOME/Library/Application Support/Zed/db/0-stable/db.sqlite"}

# Roots of every local workspace in the running Zed session, one per line.
# Same selection as OPEN_WORKSPACES_SQL in src/lib/zed-db.ts; keep in sync.
OPEN_ROOTS_SQL="SELECT w.paths FROM workspaces w
JOIN json_each((SELECT value FROM kv_store WHERE key = 'session_window_stack')) s ON s.value = w.window_id
WHERE w.remote_connection_id IS NULL
  AND w.session_id = (SELECT value FROM kv_store WHERE key = 'session_id');"

err() { printf 'zed-open: %s\n' "$*" >&2; }

find_cli() {
  if [ -n "${ZED_CLI:-}" ]; then
    [ -x "$ZED_CLI" ] && { printf '%s\n' "$ZED_CLI"; return 0; }
    err "ZED_CLI is not executable: $ZED_CLI"
    return 1
  fi
  for c in "$(command -v zed 2>/dev/null)" /Applications/Zed.app/Contents/MacOS/cli; do
    [ -n "$c" ] && [ -x "$c" ] && { printf '%s\n' "$c"; return 0; }
  done
  err "zed CLI not found; install it from Zed (zed: install cli) or set ZED_CLI"
  return 1
}

# Session rows outlive a quit (Zed restores them on launch), so without a
# running Zed nothing is open no matter what the database says.
zed_running() {
  [ "${ZED_OPEN_ASSUME_RUNNING:-}" = 1 ] || pgrep -x zed >/dev/null 2>&1
}

open_roots() {
  zed_running || return 0
  [ -r "$ZED_DB" ] || return 0
  "$SQLITE" -readonly -batch "$ZED_DB" "$OPEN_ROOTS_SQL" 2>/dev/null
}

# Exact root match only: a window rooted at a parent folder doesn't count.
is_open() {
  # grep reads each line of the pattern as its own pattern, so a folder name
  # containing a newline could match a different open root. Zed's paths column
  # is newline-separated, so such a folder can't be matched reliably anyway.
  case $1 in *"
"*) return 1 ;; esac
  open_roots | grep -Fxq -- "$1"
}

pull() {
  git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  # Never prompt and never block the open for long; a failed pull is not fatal.
  GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=5' \
    git -C "$1" pull --ff-only >/dev/null 2>&1 || err "git pull failed in $1 (opening anyway)"
}

cli=$(find_cli) || exit 1

if [ $# -eq 0 ]; then
  exec "$cli" -n
fi

status=0
for arg in "$@"; do
  # A relative name like "-x" would otherwise be read by zed as a flag.
  case $arg in -*) arg=./$arg ;; esac
  if [ -d "$arg" ]; then
    # Zed stores canonical paths (/tmp is /private/tmp), so resolve symlinks.
    dir=$(cd -P -- "$arg" 2>/dev/null && pwd -P) || { err "can't read $arg"; status=1; continue; }
    if is_open "$dir"; then
      # -e matches exact workspace roots and activates that window. Plain
      # `zed <dir>` would skip root matches when cli_default_open_behavior is
      # "new_window" and open a duplicate.
      "$cli" -e "$dir" || status=1
    else
      pull "$dir"
      "$cli" -n "$dir" || status=1
    fi
  elif [ -e "$arg" ]; then
    "$cli" -n "$arg" || status=1
  else
    err "no such file or folder: $arg"
    status=1
  fi
done
exit $status
