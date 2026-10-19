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

const isRemoved = (name: string): boolean => removedNames.has(name) || name.startsWith('KOJA_');

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
  built.TERM_PROGRAM = 'koja';
  built.TERM_PROGRAM_VERSION = identity.version;
  built.KOJA_ENV = '1';
  built.KOJA_WORKSPACE_ID = identity.workspaceId;
  built.KOJA_TAB_ID = identity.tabId;
  built.KOJA_PANE_ID = identity.paneId;
  built.KOJA_SOCKET_PATH = identity.socketPath;
  built.KOJA_BIN_PATH = identity.binaryPath;

  built.fish_handle_reflow ??= '0';

  return built;
};
