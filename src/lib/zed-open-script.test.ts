// Runs droplet/zed-open.sh against a fixture database and a fake zed CLI that
// records how it was called.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { makeZedDb } from "./test-fixture";

const SCRIPT = resolve(__dirname, "..", "..", "droplet", "zed-open.sh");

// realpath: on macOS the temp dir lives under /var -> /private/var, and Zed
// stores canonical paths, so the fixture must too.
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "zed-open-test-")));
after(() => rmSync(tmp, { recursive: true, force: true }));

const open = join(tmp, "repos", "open-repo");
const secondRoot = join(tmp, "repos", "second-root");
const closed = join(tmp, "repos", "closed-repo");
const parentOnly = join(tmp, "repos", "parent");
const child = join(parentOnly, "child");
for (const dir of [open, secondRoot, closed, child]) mkdirSync(dir, { recursive: true });
symlinkSync(open, join(tmp, "link-to-open"));
writeFileSync(join(tmp, "file.txt"), "x");

const dbDir = join(tmp, "db");
mkdirSync(dbDir);
const db = makeZedDb(
  dbDir,
  [
    { id: 1, paths: [open], windowId: 10 },
    { id: 2, paths: [join(tmp, "repos", "multi"), secondRoot], windowId: 20 },
    { id: 3, paths: [closed], windowId: 30, session: null },
    { id: 4, paths: [parentOnly], windowId: 40 },
  ],
  [10, 20, 30, 40],
);

const log = join(tmp, "zed.log");
const fakeCli = join(tmp, "fake-zed");
writeFileSync(fakeCli, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n`);
chmodSync(fakeCli, 0o755);

function run(...args: string[]) {
  rmSync(log, { force: true });
  const res = spawnSync("/bin/sh", [SCRIPT, ...args], {
    env: { HOME: tmp, ZED_CLI: fakeCli, ZED_DB: db, ZED_OPEN_ASSUME_RUNNING: "1" },
    encoding: "utf8",
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  return { status: res.status, calls, stderr: res.stderr };
}

test("an open folder is focused with -e", () => {
  assert.deepEqual(run(open), { status: 0, calls: [`-e ${open}`], stderr: "" });
});

test("any root of a multi-root window counts as open", () => {
  assert.deepEqual(run(secondRoot).calls, [`-e ${secondRoot}`]);
});

test("symlinks and trailing slashes resolve to the stored path", () => {
  assert.deepEqual(run(join(tmp, "link-to-open")).calls, [`-e ${open}`]);
  assert.deepEqual(run(`${open}/`).calls, [`-e ${open}`]);
});

test("a closed folder opens a new window", () => {
  assert.deepEqual(run(closed).calls, [`-n ${closed}`]);
});

test("a window on a parent folder doesn't count as the child being open", () => {
  assert.deepEqual(run(child).calls, [`-n ${child}`]);
});

test("a folder name with a newline can't fake a match on another open root", () => {
  // grep would read "<tmp>/nl\n<open>" as two patterns and match its second line.
  const tricky = `${join(tmp, "nl\n")}${open}`;
  mkdirSync(tricky, { recursive: true });
  // The call log is newline-separated, so compare it whole.
  assert.equal(run(tricky).calls.join("\n"), `-n ${tricky}`);
});

test("each argument is handled on its own", () => {
  assert.deepEqual(run(open, closed).calls, [`-e ${open}`, `-n ${closed}`]);
});

test("files open in a new window, missing paths fail", () => {
  assert.deepEqual(run(join(tmp, "file.txt")).calls, [`-n ${join(tmp, "file.txt")}`]);
  const missing = run(join(tmp, "nope"));
  assert.equal(missing.status, 1);
  assert.deepEqual(missing.calls, []);
  assert.match(missing.stderr, /no such file or folder/);
});

test("no arguments opens an empty window", () => {
  assert.deepEqual(run().calls, ["-n"]);
});

test("without a readable database, folders open in a new window", () => {
  rmSync(log, { force: true });
  const res = spawnSync("/bin/sh", [SCRIPT, open], {
    env: { HOME: tmp, ZED_CLI: fakeCli, ZED_DB: join(tmp, "missing.sqlite"), ZED_OPEN_ASSUME_RUNNING: "1" },
    encoding: "utf8",
  });
  assert.equal(res.status, 0);
  assert.equal(readFileSync(log, "utf8").trim(), `-n ${open}`);
});
