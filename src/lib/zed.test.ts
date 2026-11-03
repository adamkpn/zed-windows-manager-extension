import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { buildPath, findBinary, tildify } from "./env";
import { focusArgs, focusWorkspace, gitBranch } from "./zed";

const tmp = mkdtempSync(join(tmpdir(), "zed-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

test("focusArgs uses -e (exact root match) and rejects relative paths", () => {
  assert.deepEqual(focusArgs(["/a"]), ["-e", "/a"]);
  assert.deepEqual(focusArgs(["/a", "/b"]), ["-e", "/a", "/b"]);
  assert.throws(() => focusArgs([]), /no folder/);
  assert.throws(() => focusArgs(["-n"]), /absolute/);
  assert.throws(() => focusArgs(["rel/path"]), /absolute/);
});

test("focusWorkspace runs the CLI and surfaces its stderr", async () => {
  const log = join(tmp, "args.log");
  const ok = join(tmp, "zed-ok");
  writeFileSync(ok, `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n`);
  chmodSync(ok, 0o755);
  await focusWorkspace(ok, ["/some/repo"]);
  assert.equal(readFileSync(log, "utf8"), "-e\n/some/repo\n");

  const bad = join(tmp, "zed-bad");
  writeFileSync(bad, "#!/bin/sh\necho 'boom: no window' >&2\nexit 2\n");
  chmodSync(bad, 0o755);
  await assert.rejects(focusWorkspace(bad, ["/x"]), /boom: no window/);
});

test("gitBranch reads HEAD for branches, detached heads, and .git files", () => {
  const repo = join(tmp, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/feat/zed-windows\n");
  assert.equal(gitBranch(repo), "feat/zed-windows");

  writeFileSync(join(repo, ".git", "HEAD"), "0123456789abcdef0123456789abcdef01234567\n");
  assert.equal(gitBranch(repo), "0123456");

  const worktree = join(tmp, "worktree");
  const realGitDir = join(tmp, "repo", ".git", "worktrees", "wt");
  mkdirSync(worktree);
  mkdirSync(realGitDir, { recursive: true });
  writeFileSync(join(realGitDir, "HEAD"), "ref: refs/heads/wt-branch\n");
  writeFileSync(join(worktree, ".git"), `gitdir: ${realGitDir}\n`);
  assert.equal(gitBranch(worktree), "wt-branch");

  const plain = join(tmp, "plain");
  mkdirSync(plain);
  assert.equal(gitBranch(plain), undefined);
  assert.equal(gitBranch(join(tmp, "missing")), undefined);
});

test("tildify", () => {
  assert.equal(tildify("/Users/me/Repos/x", "/Users/me"), "~/Repos/x");
  assert.equal(tildify("/Users/me", "/Users/me"), "~");
  assert.equal(tildify("/Users/meow/x", "/Users/me"), "/Users/meow/x");
  assert.equal(tildify("/x", "/"), "/x");
});

test("buildPath drops relative entries and prepends Homebrew", () => {
  assert.equal(buildPath(".:bin:/custom"), "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/custom");
});

test("findBinary honours an override and falls back to the given paths", () => {
  const bin = join(tmp, "fake-cli");
  writeFileSync(bin, "#!/bin/sh\n");
  chmodSync(bin, 0o755);
  assert.equal(findBinary("zed", bin), bin);
  assert.equal(findBinary("zed", join(tmp, "nope")), undefined);
  assert.equal(findBinary("zed", "relative/zed"), undefined);
  assert.equal(findBinary("definitely-not-a-real-binary-xyz", undefined, [bin]), bin);
});
