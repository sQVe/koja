import { expect, it } from 'bun:test';

import { paneId, tabId, workspaceId } from '../ids.ts';
import { buildPaneEnvironment } from './paneEnvironment.ts';

const identity = {
  paneId: paneId(3),
  tabId: tabId(2),
  workspaceId: workspaceId(1),
  socketPath: '/run/phi.sock',
  binaryPath: '/usr/bin/phi',
  version: '1.2.3',
};

it('removes markers of other terminals and sessions', () => {
  const built = buildPaneEnvironment(
    {
      HOME: '/home/user',
      TMUX: '/tmp/tmux-1/default,1,0',
      TMUX_PANE: '%1',
      HERDR_PANE_ID: 'p1',
      HERDR_ENV: '1',
      PHI_PANE_ID: 'pane-9',
      PHI_EXTRA: 'x',
      TERM_PROGRAM: 'WezTerm',
      WEZTERM_PANE: '4',
      LC_TERMINAL: 'iTerm2',
      CLAUDECODE: '1',
      ZELLIJ: '0',
    },
    identity,
  );

  expect(built.HOME).toBe('/home/user');
  expect(built.TMUX).toBeUndefined();
  expect(built.TMUX_PANE).toBeUndefined();
  expect(built.HERDR_PANE_ID).toBeUndefined();
  expect(built.HERDR_ENV).toBeUndefined();
  expect(built.PHI_EXTRA).toBeUndefined();
  expect(built.WEZTERM_PANE).toBeUndefined();
  expect(built.LC_TERMINAL).toBeUndefined();
  expect(built.CLAUDECODE).toBeUndefined();
  expect(built.ZELLIJ).toBeUndefined();
  expect(built.TERM_PROGRAM).toBe('phi');
});

it('sets the Phi values for the pane', () => {
  const built = buildPaneEnvironment({}, identity);

  expect(built).toEqual({
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'phi',
    TERM_PROGRAM_VERSION: '1.2.3',
    PHI_ENV: '1',
    PHI_WORKSPACE_ID: 'workspace-1',
    PHI_TAB_ID: 'tab-2',
    PHI_PANE_ID: 'pane-3',
    PHI_SOCKET_PATH: '/run/phi.sock',
    PHI_BIN_PATH: '/usr/bin/phi',
    fish_handle_reflow: '0',
  });
});

it('keeps an inherited fish_handle_reflow', () => {
  const built = buildPaneEnvironment({ fish_handle_reflow: '1' }, identity);

  expect(built.fish_handle_reflow).toBe('1');
});

it('keeps other variables', () => {
  const built = buildPaneEnvironment({ PATH: '/bin', SHELL: '/bin/fish', LANG: 'C' }, identity);

  expect(built.PATH).toBe('/bin');
  expect(built.SHELL).toBe('/bin/fish');
  expect(built.LANG).toBe('C');
});
