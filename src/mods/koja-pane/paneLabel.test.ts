import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program } from 'herdr';

import { paneFolder, paneName } from './paneLabel.ts';

const programOf = (overrides: Partial<Program>): Program => ({
  key: 'program',
  name: '',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: false,
  agent: false,
  ...overrides,
});

const paneOf = (title: string, program: Partial<Program>): PaneInfo => ({
  pane: 'p1',
  terminal: 't1',
  tab: 'tb1',
  title,
  cwd: null,
  branch: null,
  status: null,
  app: null,
  program: programOf(program),
  focused: false,
  zoomed: false,
  movable: true,
});

const modPaneOf = (title: string): PaneInfo =>
  ({
    pane: 'p2',
    mod: 'koja-gallery',
    terminal: null,
    tab: 'tb1',
    title,
    focused: false,
    zoomed: false,
  }) as PaneInfo;

describe('paneName', () => {
  test('shows the agent name over the terminal title', () => {
    const pane = paneOf('vim notes.md', { name: 'Claude Code', agent: true });

    expect(paneName(pane)).toBe('Claude Code');
  });

  test('shows the shell name over the terminal title', () => {
    const pane = paneOf('~/code', { name: 'zsh', shell: true });

    expect(paneName(pane)).toBe('zsh');
  });

  test('shows the terminal title for a program that is neither agent nor shell', () => {
    const pane = paneOf('vim notes.md', { name: 'Neovim' });

    expect(paneName(pane)).toBe('vim notes.md');
  });

  test('shows the program name when the terminal has no title', () => {
    const pane = paneOf('', { name: 'Neovim' });

    expect(paneName(pane)).toBe('Neovim');
  });

  test('shows shell when nothing names the pane', () => {
    const pane = paneOf('', {});

    expect(paneName(pane)).toBe('shell');
  });

  test('shows the mod name for a mod pane, which has no program', () => {
    expect(paneName(modPaneOf('Gallery'))).toBe('Gallery');
  });
});

describe('paneFolder', () => {
  test('gives the folder of a terminal pane', () => {
    const pane = { ...paneOf('zsh', { shell: true }), cwd: '/home/dev/code' };

    expect(paneFolder(pane)).toBe('/home/dev/code');
  });

  test('gives no folder for a mod pane, which has none', () => {
    expect(paneFolder(modPaneOf('Gallery'))).toBeNull();
  });
});
