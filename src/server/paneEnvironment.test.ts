import { expect, it } from 'bun:test';

import { paneId, tabId, workspaceId } from '../ids.ts';
import { buildPaneEnvironment, createReportPass } from './paneEnvironment.ts';

const identity = {
  paneId: paneId(3),
  tabId: tabId(2),
  workspaceId: workspaceId(1),
  socketPath: '/run/koja.sock',
  binaryPath: '/usr/bin/koja',
  version: '1.2.3',
  reportPass: 'a'.repeat(64),
};

it('removes markers of other terminals and sessions', () => {
  const built = buildPaneEnvironment(
    {
      HOME: '/home/user',
      TMUX: '/tmp/tmux-1/default,1,0',
      TMUX_PANE: '%1',
      KOJA_PANE_ID: 'pane-9',
      KOJA_EXTRA: 'x',
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
  expect(built.KOJA_EXTRA).toBeUndefined();
  expect(built.WEZTERM_PANE).toBeUndefined();
  expect(built.LC_TERMINAL).toBeUndefined();
  expect(built.CLAUDECODE).toBeUndefined();
  expect(built.ZELLIJ).toBeUndefined();
  expect(built.TERM_PROGRAM).toBe('koja');
});

it('sets the Koja values for the pane', () => {
  const built = buildPaneEnvironment({}, identity);

  expect(built).toEqual({
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'koja',
    TERM_PROGRAM_VERSION: '1.2.3',
    KOJA_ENV: '1',
    KOJA_WORKSPACE_ID: 'workspace-1',
    KOJA_TAB_ID: 'tab-2',
    KOJA_PANE_ID: 'pane-3',
    KOJA_SOCKET_PATH: '/run/koja.sock',
    KOJA_BIN_PATH: '/usr/bin/koja',
    KOJA_REPORT_TOKEN: identity.reportPass,
    fish_handle_reflow: '0',
  });
});

it('gives two starts different passes instead of an inherited pass', () => {
  const inherited = { KOJA_REPORT_TOKEN: 'old-pass' };
  const first = buildPaneEnvironment(inherited, { ...identity, reportPass: createReportPass() });
  const second = buildPaneEnvironment(inherited, { ...identity, reportPass: createReportPass() });

  expect(first.KOJA_REPORT_TOKEN).toMatch(/^[0-9a-f]{64}$/);
  expect(second.KOJA_REPORT_TOKEN).toMatch(/^[0-9a-f]{64}$/);
  expect(first.KOJA_REPORT_TOKEN).not.toBe(second.KOJA_REPORT_TOKEN);
  expect(first.KOJA_REPORT_TOKEN).not.toBe(inherited.KOJA_REPORT_TOKEN);
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
