import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { tildify } from "./lib/env";
import { ZedWorkspace, readOpenWorkspaces, resolveDbPath } from "./lib/zed-db";
import { findZedCli, focusWorkspace, gitBranch, isZedRunning } from "./lib/zed";

const prefs = () => getPreferenceValues<Preferences.SearchWindows>();

interface Row extends ZedWorkspace {
  branch?: string;
}

type State =
  | { status: "loading"; rows: Row[] }
  | { status: "ready"; rows: Row[] }
  | { status: "not-running"; rows: [] }
  | { status: "error"; rows: []; message: string };

async function loadRows(): Promise<State> {
  if (!(await isZedRunning())) return { status: "not-running", rows: [] };
  const workspaces = await readOpenWorkspaces(resolveDbPath(prefs().zedDbPath));
  return { status: "ready", rows: workspaces.map((ws) => ({ ...ws, branch: gitBranch(ws.paths[0]) })) };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Words a search can match besides the title: every path segment and the branch.
function keywordsFor(row: Row): string[] {
  const segments = row.paths.flatMap((p) => p.split("/")).filter(Boolean);
  return [
    ...new Set([...row.paths, ...row.paths.map((p) => tildify(p)), ...segments, ...(row.branch ? [row.branch] : [])]),
  ];
}

// Set synchronously so a double ↵ can't run the CLI twice.
let focusing = false;

async function focus(row: Row) {
  if (focusing) return;
  focusing = true;
  try {
    await focusWorkspace(findZedCli(prefs().zedCliPath), row.paths);
    await closeMainWindow();
  } catch (err) {
    await showToast({ style: Toast.Style.Failure, title: `Couldn't focus ${row.name}`, message: errorMessage(err) });
  } finally {
    focusing = false;
  }
}

export default function Command() {
  const [state, setState] = useState<State>({ status: "loading", rows: [] });

  const refresh = useCallback(async () => {
    setState((prev) => ({ status: "loading", rows: prev.rows }) as State);
    try {
      setState(await loadRows());
    } catch (err) {
      setState({ status: "error", rows: [], message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const refreshAction = (
    <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh} onAction={refresh} />
  );

  return (
    <List
      isLoading={state.status === "loading"}
      searchBarPlaceholder="Search open Zed windows by folder, path or branch"
    >
      {state.status === "not-running" && (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="Zed isn't running"
          description="There are no Zed windows to switch to."
          actions={<ActionPanel>{refreshAction}</ActionPanel>}
        />
      )}
      {state.status === "error" && (
        <List.EmptyView
          icon={Icon.Warning}
          title="Couldn't read Zed's windows"
          description={state.message}
          actions={<ActionPanel>{refreshAction}</ActionPanel>}
        />
      )}
      {state.status === "ready" && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No matching Zed window"
          description="Only local folders are listed; remote (SSH) projects are skipped."
          actions={<ActionPanel>{refreshAction}</ActionPanel>}
        />
      )}
      {state.rows.map((row, index) => (
        <List.Item
          key={row.workspaceId}
          icon={row.paths.length > 1 ? Icon.NewFolder : Icon.Folder}
          title={row.name}
          subtitle={row.paths.map((p) => tildify(p)).join("  ·  ")}
          keywords={keywordsFor(row)}
          accessories={[
            ...(row.branch ? [{ tag: row.branch, icon: Icon.Code }] : []),
            ...(index === 0 ? [{ text: "Current" }] : []),
          ]}
          actions={
            <ActionPanel>
              <Action title="Focus Window" icon={Icon.AppWindow} onAction={() => focus(row)} />
              <Action.CopyToClipboard
                title="Copy Path"
                content={row.paths.join("\n")}
                shortcut={Keyboard.Shortcut.Common.CopyPath}
              />
              <Action.ShowInFinder path={row.paths[0]} shortcut={{ modifiers: ["cmd", "shift"], key: "f" }} />
              {refreshAction}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
