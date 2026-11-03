import { describe, expect, test } from 'bun:test';

import type { Entry, PaletteHost } from './entries.ts';
import { allEntries, entryShortcut, paletteRows } from './entries.ts';

interface Command {
  name: string;
  args: { name: string; required: boolean }[];
  about: string;
}

let commandList: Command[] = [];
const layoutList: string[] = ['main'];
let platform: string | null = 'linux';
let themeList: { name: string; label: string }[] = [];

const lookupIn =
  (bindings: Record<string, string>) =>
  (...actions: string[]): string | null =>
    actions.map((action) => bindings[action]).find((keys) => keys !== undefined) ?? null;

const splitRightLookup = lookupIn({ 'pane.split:right': 'ctrl-shift-o' });

const layoutLookup = lookupIn({ 'layout.switch': 'ctrl-shift-l' });

const host = (): PaletteHost => ({
  commands: () => commandList,
  layouts: () => layoutList,
  platform,
  themes: () => themeList,
});

const commandOf = (name: string): Command => ({ name, args: [], about: '' });

const entry = (id: string, name: string, group: string, title: string): Entry => ({
  id,
  name,
  args: {},
  group,
  title,
  words: '',
});

describe('allEntries', () => {
  test('keeps named entries the app knows and drops those it does not', () => {
    commandList = [commandOf('tab.new'), commandOf('pane.close')];

    const names = allEntries(host()).map((item) => item.name);

    expect(names).toContain('tab.new');
    expect(names).not.toContain('tab.rename');
  });

  test('names commands the catalog does not know, but hides pointed-at ones', () => {
    commandList = [commandOf('weird.thing'), commandOf('space.select')];

    const entries = allEntries(host());

    expect(entries.find((item) => item.name === 'weird.thing')?.title).toBe('Thing weird');
    expect(entries.some((item) => item.name === 'space.select')).toBe(false);
  });

  test("lists every theme the app reports, including Koja's own", () => {
    commandList = [commandOf('app.theme')];

    themeList = [
      { name: 'graphite', label: 'Theme: graphite' },
      { name: 'catppuccin-latte-muted', label: 'Theme: catppuccin latte muted' },
    ];

    const titles = allEntries(host())
      .filter((item) => item.name === 'app.theme')
      .map((item) => item.title);

    expect(titles).toEqual(['Theme: graphite', 'Theme: catppuccin latte muted']);
  });

  test('shows no theme choices when the app does not know app.theme', () => {
    commandList = [commandOf('tab.new')];
    themeList = [{ name: 'graphite', label: 'Theme: graphite' }];

    expect(allEntries(host()).some((item) => item.name === 'app.theme')).toBe(false);
  });

  test('hides window commands on macOS', () => {
    commandList = [commandOf('window.minimize')];

    platform = 'macos';

    expect(allEntries(host()).some((item) => item.name === 'window.minimize')).toBe(false);

    platform = 'linux';

    expect(allEntries(host()).some((item) => item.name === 'window.minimize')).toBe(true);
  });
});

describe('paletteRows', () => {
  test('lists recent first, then the rest in group order', () => {
    const all = [
      entry('a', 'a', 'Tab', 'A'),
      entry('b', 'b', 'Pane', 'B'),
      entry('c', 'c', 'Weird', 'C'),
    ];

    expect(paletteRows(all, '', ['b']).map((row) => row.head)).toEqual(['Recent', 'Tab', 'Weird']);
  });

  test('keeps only entries the query matches', () => {
    const all = [entry('a', 'a', 'Tab', 'New tab'), entry('b', 'b', 'Pane', 'Zoom pane')];

    expect(paletteRows(all, 'new', []).map((row) => row.entry.id)).toEqual(['a']);
  });

  test('ranks a recent entry first when scores tie', () => {
    const all = [entry('a', 'a', 'Tab', 'Alpha'), entry('b', 'b', 'Tab', 'Alpha')];

    expect(paletteRows(all, 'alp', ['b']).map((row) => row.entry.id)).toEqual(['b', 'a']);
  });
});

describe('entryShortcut', () => {
  test('prefers the action with the entry argument', () => {
    const item = {
      ...entry('a', 'pane.split', 'Pane', 'Split right'),
      args: { direction: 'right' },
    };

    expect(entryShortcut(item, splitRightLookup)).toBe('ctrl-shift-o');
  });

  test('answers null without a binding', () => {
    expect(entryShortcut(entry('a', 'pane.split', 'Pane', 'Split right'), () => null)).toBeNull();
  });

  test('does not fall back to the bare command for a named layout', () => {
    const item = {
      ...entry('a', 'layout.switch', 'Layout', 'Layout: Herdr'),
      args: { name: 'main' },
    };

    expect(entryShortcut(item, layoutLookup)).toBeNull();
  });
});
