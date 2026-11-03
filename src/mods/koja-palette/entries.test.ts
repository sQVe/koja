import { describe, expect, test } from 'bun:test';

import type { Entry, PaletteHost } from './entries.ts';
import { allEntries, entryShortcut, paletteRows } from './entries.ts';

interface Command {
  name: string;
  args: { name: string; required: boolean }[];
  about: string;
}

let commandList: Command[] = [];
let layoutList: string[] = ['main'];
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

  test('keeps non-window commands on macOS', () => {
    commandList = [commandOf('window.minimize'), commandOf('tab.new')];

    platform = 'macos';

    const names = allEntries(host()).map((item) => item.name);

    expect(names).not.toContain('window.minimize');
    expect(names).toContain('tab.new');

    platform = 'linux';
  });

  test('builds an id from the command name and its arguments', () => {
    commandList = [commandOf('tab.new')];

    const item = allEntries(host()).find((entryItem) => entryItem.name === 'tab.new');

    expect(item?.id).toBe('tab.new:{}');
  });

  test('turns underscores into spaces in an unknown command title', () => {
    commandList = [commandOf('weird.some_thing')];

    const item = allEntries(host()).find((entryItem) => entryItem.name === 'weird.some_thing');

    expect(item?.title).toBe('Some thing weird');
  });

  test('names a command that has no verb', () => {
    commandList = [commandOf('weird')];

    const item = allEntries(host()).find((entryItem) => entryItem.name === 'weird');

    expect(item?.title).toBe(' weird');
  });

  test('lists a known command once, from the named catalog', () => {
    commandList = [commandOf('tab.new')];

    const matches = allEntries(host()).filter((item) => item.name === 'tab.new');

    expect(matches).toHaveLength(1);
  });

  test('hides a command that requires a named argument other than name', () => {
    commandList = [
      commandOf('keep.me'),
      { name: 'drop.me', args: [{ name: 'pane', required: true }], about: '' },
      { name: 'keep.name', args: [{ name: 'name', required: true }], about: '' },
    ];

    const names = allEntries(host()).map((item) => item.name);

    expect(names).toContain('keep.me');
    expect(names).not.toContain('drop.me');
    expect(names).toContain('keep.name');
  });

  test('carries each layout name as an argument', () => {
    commandList = [];
    layoutList = ['main', 'win98', 'custom'];

    const items = allEntries(host()).filter((item) => item.name === 'layout.switch');

    expect(items.map((item) => item.args)).toEqual([
      { name: 'main' },
      { name: 'win98' },
      { name: 'custom' },
    ]);

    expect(items.map((item) => item.group)).toEqual(['Layout', 'Layout', 'Layout']);

    expect(items.map((item) => item.id)).toEqual([
      'layout.switch:{"name":"main"}',
      'layout.switch:{"name":"win98"}',
      'layout.switch:{"name":"custom"}',
    ]);

    expect(paletteRows(items, 'look', [])).toHaveLength(3);
  });

  test('carries the theme name in each theme row', () => {
    commandList = [commandOf('app.theme')];
    themeList = [{ name: 'graphite', label: 'Theme: graphite' }];

    const item = allEntries(host()).find((entryItem) => entryItem.name === 'app.theme');

    expect(item?.args).toEqual({ name: 'graphite' });
    expect(item?.id).toBe('app.theme:{"name":"graphite"}');
    expect(item?.group).toBe('App');
    expect(paletteRows(item === undefined ? [] : [item], 'colors look', [])).toHaveLength(1);
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

  test('keeps the ranked order when the input already has it', () => {
    const all = [entry('b', 'b', 'Tab', 'Alpha'), entry('a', 'a', 'Tab', 'Alpha')];

    expect(paletteRows(all, 'alp', ['b']).map((row) => row.entry.id)).toEqual(['b', 'a']);
  });

  test('matches an entry through its extra words and reports no highlight positions', () => {
    const all = [{ ...entry('a', 'a', 'Tab', 'Alpha'), words: 'zebra' }];
    const rows = paletteRows(all, 'zebra', []);

    expect(rows.map((row) => row.entry.id)).toEqual(['a']);
    expect(rows[0]?.positions).toEqual([]);
  });

  test('reports the highlight positions of a title match', () => {
    const all = [entry('a', 'a', 'Tab', 'Alpha')];

    expect(paletteRows(all, 'alp', [])[0]?.positions).toEqual([0, 1, 2]);
  });

  test('ranks a title match above a words-only match', () => {
    const wordsOnly = { ...entry('b', 'b', 'Tab', 'Alpha'), words: 'new' };
    const titleOnly = entry('a', 'a', 'Tab', 'New tab');

    expect(paletteRows([wordsOnly, titleOnly], 'new', []).map((row) => row.entry.id)).toEqual([
      'a',
      'b',
    ]);
  });

  test('ignores a recent id that is no longer in the list', () => {
    const all = [entry('a', 'a', 'Tab', 'A')];

    expect(paletteRows(all, '', ['gone']).map((row) => row.head)).toEqual(['Tab']);
  });

  test('shows at most five recent entries', () => {
    const all = Array.from({ length: 6 }, (_, index) =>
      entry(`id-${index}`, `name-${index}`, 'Tab', `Title ${index}`),
    );

    const recentIds = all.map((item) => item.id);
    const rows = paletteRows(all, '', recentIds);

    expect(rows.filter((row) => row.head === 'Recent')).toHaveLength(5);
  });

  test('drops an entry that claims the Recent group but is not recent', () => {
    const all = [entry('a', 'a', 'Recent', 'A')];

    expect(paletteRows(all, '', []).map((row) => row.entry.id)).toEqual([]);
  });

  test('ignores the case and spacing a query uses', () => {
    const all = [entry('a', 'a', 'Tab', 'New tab')];

    expect(paletteRows(all, '  NEW   TAB ', []).map((row) => row.entry.id)).toEqual(['a']);
  });

  test('reports no highlight positions for a listing without a query', () => {
    const all = [entry('a', 'a', 'Tab', 'A'), entry('b', 'b', 'Pane', 'B')];

    expect(paletteRows(all, '', ['a']).map((row) => row.positions)).toEqual([[], []]);
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
