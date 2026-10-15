import type { PaneId, TabId, WorkspaceId } from '../ids.ts';

type Environment = Record<string, string | undefined>;

export interface PaneIdentity {
  paneId: PaneId;
  tabId: TabId;
  workspaceId: WorkspaceId;
  socketPath: string;
  binaryPath: string;
  version: string;
}

const removedNames = new Set([
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'LC_TERMINAL',
  'LC_TERMINAL_VERSION',
  'WEZTERM_PANE',
  'KITTY_WINDOW_ID',
  'WT_SESSION',
  'TMUX',
  'TMUX_PANE',
  'STY',
  'ZELLIJ',
  'ZELLIJ_SESSION_NAME',
  'ZELLIJ_PANE_ID',
  'CODEX_THREAD_ID',
  'OMPCODE',
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_TOKEN',
]);

const removedPrefixes = ['HERDR_', 'PHI_'];

const isRemoved = (name: string): boolean =>
  removedNames.has(name) || removedPrefixes.some((prefix) => name.startsWith(prefix));

export const buildPaneEnvironment = (
  serverEnvironment: Environment,
  identity: PaneIdentity,
): Environment => {
  const built: Environment = {};

  for (const [name, value] of Object.entries(serverEnvironment)) {
    if (!isRemoved(name)) {
      built[name] = value;
    }
  }

  built.TERM = 'xterm-256color';
  built.COLORTERM = 'truecolor';
  built.TERM_PROGRAM = 'phi';
  built.TERM_PROGRAM_VERSION = identity.version;
  built.PHI_ENV = '1';
  built.PHI_WORKSPACE_ID = identity.workspaceId;
  built.PHI_TAB_ID = identity.tabId;
  built.PHI_PANE_ID = identity.paneId;
  built.PHI_SOCKET_PATH = identity.socketPath;
  built.PHI_BIN_PATH = identity.binaryPath;

  built.fish_handle_reflow ??= '0';

  return built;
};
