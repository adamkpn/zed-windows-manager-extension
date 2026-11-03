import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { expandHome } from "./env";

export const SQLITE = "/usr/bin/sqlite3";

export function defaultDbPath(home = homedir()): string {
  return join(home, "Library", "Application Support", "Zed", "db", "0-stable", "db.sqlite");
}

// The windows of the running Zed session, most recently used first.
//
// Zed keeps one `workspaces` row per set of root folders. Rows belonging to the
// current session carry its `session_id`, and `session_window_stack` lists the
// live window ids in focus order. Rows of closed windows lose their session_id;
// rows from before a quit keep it until the next launch, which is why callers
// must also check that Zed is running. Remote (SSH) workspaces are skipped:
// they can't be focused through a local path.
//
// droplet/zed-open.sh runs the same selection; keep the two in sync.
export const OPEN_WORKSPACES_SQL = `
SELECT w.workspace_id, w.paths, w.paths_order, w.window_id, w.timestamp, CAST(s.key AS INTEGER) AS stack_index
FROM workspaces w
JOIN json_each((SELECT value FROM kv_store WHERE key = 'session_window_stack')) s ON s.value = w.window_id
WHERE w.remote_connection_id IS NULL
  AND w.session_id = (SELECT value FROM kv_store WHERE key = 'session_id')
ORDER BY stack_index, w.timestamp DESC`;

export interface WorkspaceRow {
  workspace_id: number;
  paths: string | null;
  paths_order: string | null;
  window_id: number;
  timestamp: string;
  stack_index: number;
}

export interface ZedWorkspace {
  workspaceId: number;
  windowId: number;
  /** Root folders in the order Zed shows them. */
  paths: string[];
  /** What Zed puts in the window title: the root folder names. */
  name: string;
  /** Position in Zed's window stack; 0 is the window used last. */
  stackIndex: number;
  lastSeen: string;
}

export class ZedDbError extends Error {}

// `paths` holds the roots sorted and newline-separated; `paths_order` is a
// comma-separated list giving each sorted root's original position.
export function orderedPaths(paths: string | null, order: string | null): string[] {
  const roots = (paths ?? "").split("\n").filter((p) => p && isAbsolute(p));
  const positions = (order ?? "").split(",").map((n) => Number.parseInt(n, 10));
  const valid =
    positions.length === roots.length &&
    positions.every((n) => Number.isInteger(n) && n >= 0 && n < roots.length) &&
    new Set(positions).size === positions.length;
  if (!valid) return roots;
  const out: string[] = new Array(roots.length);
  roots.forEach((root, i) => (out[positions[i]] = root));
  return out;
}

export function toWorkspaces(rows: WorkspaceRow[]): ZedWorkspace[] {
  return rows
    .map((row) => {
      const paths = orderedPaths(row.paths, row.paths_order);
      return {
        workspaceId: row.workspace_id,
        windowId: row.window_id,
        paths,
        name: paths.map((p) => basename(p)).join(", "),
        stackIndex: row.stack_index,
        lastSeen: row.timestamp,
      };
    })
    .filter((ws) => ws.paths.length > 0)
    .sort((a, b) => a.stackIndex - b.stackIndex);
}

export function resolveDbPath(pref?: string): string {
  const path = pref?.trim() ? expandHome(pref.trim()) : defaultDbPath();
  if (!isAbsolute(path)) throw new ZedDbError(`Zed Database must be an absolute path: ${JSON.stringify(pref)}`);
  return path;
}

export async function readOpenWorkspaces(dbPath: string): Promise<ZedWorkspace[]> {
  if (!existsSync(dbPath)) throw new ZedDbError(`Zed database not found at ${dbPath}`);
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      SQLITE,
      ["-readonly", "-json", dbPath, OPEN_WORKSPACES_SQL],
      { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 },
      (err, out, stderr) => {
        if (!err) return resolve(String(out));
        const detail = (String(stderr ?? "") || err.message).trim();
        const hint = /no such (table|column)/.test(detail) ? " (did a Zed update change its database?)" : "";
        reject(new ZedDbError(`Couldn't read Zed's database: ${detail}${hint}`));
      },
    );
  });
  // sqlite3 prints nothing at all when no row matches.
  if (!stdout.trim()) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(stdout);
  } catch {
    throw new ZedDbError("sqlite3 returned output that isn't JSON");
  }
  if (!Array.isArray(rows)) throw new ZedDbError("sqlite3 returned an unexpected result");
  return toWorkspaces(rows as WorkspaceRow[]);
}
