// Test helper: a throwaway database with the parts of Zed's schema we read.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { SQLITE } from "./zed-db";

export const SESSION = "11111111-2222-3333-4444-555555555555";

export interface FixtureWorkspace {
  id: number;
  paths: string[];
  order?: number[];
  session?: string | null;
  windowId?: number | null;
  remote?: boolean;
  timestamp?: string;
}

const quote = (value: string | number | null | undefined) =>
  value === null || value === undefined
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${value.replace(/'/g, "''")}'`;

export function makeZedDb(dir: string, workspaces: FixtureWorkspace[], stack: number[], session = SESSION): string {
  const db = join(dir, "db.sqlite");
  const sql = [
    "CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    "CREATE TABLE workspaces (workspace_id INTEGER PRIMARY KEY, paths TEXT, paths_order TEXT, remote_connection_id INTEGER, timestamp TEXT NOT NULL, session_id TEXT, window_id INTEGER);",
    `INSERT INTO kv_store VALUES ('session_id', ${quote(session)});`,
    `INSERT INTO kv_store VALUES ('session_window_stack', ${quote(JSON.stringify(stack))});`,
    ...workspaces.map((ws) => {
      // Stored like Zed's PathList: sorted roots plus each one's original position.
      const indexed = ws.paths.map((p, i) => ({ p, i })).sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
      const order = ws.order ?? indexed.map((e) => e.i);
      return `INSERT INTO workspaces VALUES (${ws.id}, ${quote(indexed.map((e) => e.p).join("\n"))}, ${quote(order.join(","))}, ${ws.remote ? 1 : "NULL"}, ${quote(ws.timestamp ?? "2026-11-03 05:00:00")}, ${quote(ws.session === undefined ? SESSION : ws.session)}, ${quote(ws.windowId === undefined ? ws.id * 10 : ws.windowId)});`;
    }),
  ].join("\n");
  execFileSync(SQLITE, [db], { input: sql });
  return db;
}
