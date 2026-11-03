import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program } from 'herdr';

import { paneName } from './paneLabel.ts';

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
    const { program: _program, ...terminalPane } = paneOf('Gallery', {});
    const modPane = { ...terminalPane, terminal: null, mod: 'koja-gallery' } as PaneInfo;

    expect(paneName(modPane)).toBe('Gallery');
  });
});
