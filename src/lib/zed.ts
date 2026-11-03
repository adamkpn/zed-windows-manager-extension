import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { buildPath, findBinary } from "./env";

export const ZED_APP_CLI = "/Applications/Zed.app/Contents/MacOS/cli";

export class ZedCliNotFoundError extends Error {
  constructor() {
    super("Zed CLI not found. Install it from Zed (zed: install cli) or set its path in preferences.");
  }
}

export function findZedCli(override?: string): string {
  const cli = findBinary("zed", override, [ZED_APP_CLI]);
  if (!cli) throw new ZedCliNotFoundError();
  return cli;
}

// Session rows survive a quit (Zed restores them on launch), so the database
// alone can't tell whether a window is open.
export function isZedRunning(): Promise<boolean> {
  return new Promise((done) => {
    execFile("/usr/bin/pgrep", ["-x", "zed"], { timeout: 5_000 }, (err) => done(!err));
  });
}

// `zed -e` matches the given folders against the roots of every open workspace
// (WorkspaceMatching::MatchExact) and activates that window. Plain `zed <dir>`
// can't be used: with "cli_default_open_behavior": "new_window" it skips root
// matches and opens a second window.
export function focusArgs(paths: string[]): string[] {
  if (paths.length === 0) throw new Error("no folder to focus");
  for (const path of paths) {
    if (!isAbsolute(path)) throw new Error(`not an absolute path: ${JSON.stringify(path)}`);
  }
  return ["-e", ...paths];
}

export function focusWorkspace(cli: string, paths: string[]): Promise<void> {
  const args = focusArgs(paths);
  return new Promise((done, fail) => {
    execFile(cli, args, { timeout: 15_000, env: { ...process.env, PATH: buildPath() } }, (err, _out, stderr) => {
      if (!err) return done();
      fail(new Error((String(stderr ?? "") || err.message).trim().split("\n").slice(-3).join(" ")));
    });
  });
}

// The checked-out branch, read from .git/HEAD without starting git. Handles
// worktrees and submodules, where .git is a file pointing at the real git dir.
// Detached HEADs show the short commit; anything else gives undefined.
export function gitBranch(dir: string): string | undefined {
  try {
    let gitDir = join(dir, ".git");
    if (statSync(gitDir).isFile()) {
      const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitDir, "utf8"));
      if (!match) return undefined;
      gitDir = resolve(dir, match[1].trim());
    }
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    if (ref) return ref[1];
    return /^[0-9a-f]{40,64}$/.test(head) ? head.slice(0, 7) : undefined;
  } catch {
    return undefined;
  }
}
