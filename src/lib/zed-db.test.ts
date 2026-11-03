import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { makeZedDb } from "./test-fixture";
import { SQLITE, ZedDbError, orderedPaths, readOpenWorkspaces, resolveDbPath, toWorkspaces } from "./zed-db";

const tmp = mkdtempSync(join(tmpdir(), "zed-db-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const freshDir = () => mkdtempSync(join(tmp, `${n++}-`));

test("orderedPaths restores the original root order", () => {
  assert.deepEqual(orderedPaths("/a\n/b", "1,0"), ["/b", "/a"]);
  assert.deepEqual(orderedPaths("/a\n/b\n/c", "0,2,1"), ["/a", "/c", "/b"]);
  assert.deepEqual(orderedPaths("/a", "0"), ["/a"]);
});

test("orderedPaths falls back to stored order when paths_order is unusable", () => {
  assert.deepEqual(orderedPaths("/a\n/b", ""), ["/a", "/b"]);
  assert.deepEqual(orderedPaths("/a\n/b", "0"), ["/a", "/b"]);
  assert.deepEqual(orderedPaths("/a\n/b", "0,0"), ["/a", "/b"]);
  assert.deepEqual(orderedPaths("/a\n/b", "0,7"), ["/a", "/b"]);
  assert.deepEqual(orderedPaths(null, null), []);
  assert.deepEqual(orderedPaths("relative\n/abs", "0,1"), ["/abs"]);
});

test("toWorkspaces names windows after their roots and sorts by stack", () => {
  const ws = toWorkspaces([
    { workspace_id: 2, paths: "/r/b", paths_order: "0", window_id: 20, timestamp: "t", stack_index: 1 },
    { workspace_id: 1, paths: "/r/a\n/r/z", paths_order: "1,0", window_id: 10, timestamp: "t", stack_index: 0 },
    { workspace_id: 3, paths: "", paths_order: "", window_id: 30, timestamp: "t", stack_index: 2 },
  ]);
  assert.deepEqual(
    ws.map((w) => [w.workspaceId, w.name, w.paths]),
    [
      [1, "z, a", ["/r/z", "/r/a"]],
      [2, "b", ["/r/b"]],
    ],
  );
});

test("readOpenWorkspaces returns live local windows in focus order", async () => {
  const db = makeZedDb(
    freshDir(),
    [
      { id: 1, paths: ["/repos/one"], windowId: 100 },
      { id: 2, paths: ["/repos/two", "/repos/a-second-root"], windowId: 200 },
      { id: 3, paths: ["/repos/closed"], windowId: 300, session: null },
      { id: 4, paths: ["/repos/old-session"], windowId: 400, session: "older-session" },
      { id: 5, paths: ["/repos/not-in-stack"], windowId: 500 },
      { id: 6, paths: ["/remote/project"], windowId: 600, remote: true },
      { id: 7, paths: ["/repos/no-window"], windowId: null },
      // Very large ids are real (e.g. 141733920774) and must still match.
      { id: 8, paths: ["/repos/big-id"], windowId: 141733920774 },
    ],
    [200, 141733920774, 100, 300, 400, 600, 999],
  );
  const ws = await readOpenWorkspaces(db);
  assert.deepEqual(
    ws.map((w) => [w.name, w.paths, w.windowId, w.stackIndex]),
    [
      ["two, a-second-root", ["/repos/two", "/repos/a-second-root"], 200, 0],
      ["big-id", ["/repos/big-id"], 141733920774, 1],
      ["one", ["/repos/one"], 100, 2],
    ],
  );
});

test("readOpenWorkspaces handles an empty session", async () => {
  assert.deepEqual(await readOpenWorkspaces(makeZedDb(freshDir(), [], [])), []);
  assert.deepEqual(await readOpenWorkspaces(makeZedDb(freshDir(), [{ id: 1, paths: ["/x"] }], [])), []);
});

test("readOpenWorkspaces explains a missing database or a changed schema", async () => {
  await assert.rejects(readOpenWorkspaces(join(tmp, "missing.sqlite")), (err: Error) => {
    assert.ok(err instanceof ZedDbError);
    assert.match(err.message, /not found/);
    return true;
  });
  const db = join(freshDir(), "db.sqlite");
  execFileSync(SQLITE, [db], { input: "CREATE TABLE kv_store (key TEXT, value TEXT);" });
  await assert.rejects(readOpenWorkspaces(db), /no such table: workspaces.*Zed update/);
});

test("resolveDbPath", () => {
  assert.match(resolveDbPath(""), /Zed\/db\/0-stable\/db\.sqlite$/);
  assert.match(resolveDbPath("  "), /0-stable/);
  assert.equal(resolveDbPath("/x/db.sqlite"), "/x/db.sqlite");
  assert.ok(!resolveDbPath("~/db.sqlite").startsWith("~"));
  assert.throws(() => resolveDbPath("db.sqlite"), ZedDbError);
});
