import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

// Launchers start extensions with a minimal PATH, so Homebrew and system dirs
// are prepended to find `zed`.
export const EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

// Relative entries (".", "bin") are dropped: they resolve against the
// extension's working directory and would let a planted binary win the lookup.
export function buildPath(path = process.env.PATH ?? ""): string {
  const parts = path.split(":").filter((dir) => dir && isAbsolute(dir));
  return [...EXTRA_PATH.filter((dir) => !parts.includes(dir)), ...parts].join(":");
}

export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

// "/Users/me/Repos/x" -> "~/Repos/x", for display only.
export function tildify(path: string, home = homedir()): string {
  if (!home || home === "/") return path;
  if (path === home) return "~";
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

// An explicit override must be an absolute (or ~-relative) executable path;
// otherwise search the PATH built above, then `fallbacks`.
export function findBinary(name: string, override?: string, fallbacks: string[] = []): string | undefined {
  const explicit = override?.trim();
  if (explicit) {
    const path = expandHome(explicit);
    return isAbsolute(path) && isExecutable(path) ? path : undefined;
  }
  const candidates = [
    ...buildPath()
      .split(":")
      .map((dir) => join(dir, name)),
    ...fallbacks,
  ];
  return candidates.find(isExecutable);
}
