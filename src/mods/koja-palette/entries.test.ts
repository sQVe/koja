import { beforeEach, describe, expect, test } from 'bun:test';

import type { OverlayHint } from '../../kit/shortcutBinding.ts';
import type { ThemeChoice } from '../../kit/themes.ts';
import type { Entry, PaletteHost } from './entries.ts';
import { allEntries, entryHint, headingOf, paletteCount, paletteRows } from './entries.ts';
import type { ModPalette } from './modPalette.ts';

interface Command {
  name: string;
  args: { name: string; required: boolean }[];
  about: string;
}

let commandList: Command[] = [];
let layoutList: string[] = ['main'];
let platform: string | null = 'linux';
let themeList: ThemeChoice[] = [];
let darkWindow = true;
let currentLayout: string | null = 'main';

const hintIn =
  (bindings: Record<string, OverlayHint>) =>
  (...actions: string[]): OverlayHint => {
    const hint = actions.map((action) => bindings[action]).find((found) => found !== undefined);

    return hint ?? { normal: [] };
  };

const splitRightHint = hintIn({ 'pane.split:right': { normal: ['ctrl-shift-o'] } });

const layoutHint = hintIn({
  'layout.switch': { normal: ['ctrl-shift-l'], insert: ['tab'] },
});

const host = (): PaletteHost => ({
  commands: () => commandList,
  layouts: () => layoutList,
  platform,
  themes: () => themeList,
  dark: darkWindow,
  layout: currentLayout,
});

const themeOf = (name: string, light: boolean): ThemeChoice => ({
  name,
  label: `Theme: ${name}`,
  light,
});

beforeEach(() => {
  commandList = [];
  layoutList = ['main'];
  platform = 'linux';
  themeList = [];
  darkWindow = true;
  currentLayout = 'main';
});

const commandOf = (name: string): Command => ({ name, args: [], about: '' });

const entry = (id: string, name: string, group: string, title: string): Entry => ({
  id,
  name,
  args: {},
  group,
  title,
  words: '',
  icon: 'command',
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

  test('lists no agent jump even when the app offers it', () => {
    commandList = [commandOf('agent.next'), commandOf('agent.prev'), commandOf('tab.new')];

    const names = allEntries(host()).map((item) => item.name);

    expect(names).toContain('tab.new');
    expect(names).not.toContain('agent.next');
    expect(names).not.toContain('agent.prev');
  });

  test("offers only the themes of the window's lightness", () => {
    commandList = [commandOf('app.theme')];
    themeList = [themeOf('graphite', false), themeOf('catppuccin-latte', true)];

    const darkTitles = allEntries(host())
      .filter((item) => item.name === 'app.theme')
      .map((item) => item.title);

    expect(darkTitles).toEqual(['Theme: graphite']);

    darkWindow = false;

    const lightTitles = allEntries(host())
      .filter((item) => item.name === 'app.theme')
      .map((item) => item.title);

    expect(lightTitles).toEqual(['Theme: catppuccin-latte']);
  });

  test('offers a theme named like a layout only for that layout', () => {
    commandList = [commandOf('app.theme')];
    layoutList = ['main', 'graphite'];
    themeList = [themeOf('graphite', false)];

    const beforeSwitch = allEntries(host()).some((item) => item.name === 'app.theme');

    expect(beforeSwitch).toBe(false);

    currentLayout = 'graphite';

    const afterSwitch = allEntries(host()).some((item) => item.name === 'app.theme');

    expect(afterSwitch).toBe(true);
  });

  test('shows no theme choices when the app does not know app.theme', () => {
    commandList = [commandOf('tab.new')];
    themeList = [themeOf('graphite', false)];

    const hasThemeEntry = allEntries(host()).some((item) => item.name === 'app.theme');

    expect(hasThemeEntry).toBe(false);
  });

  test('hides window commands on macOS', () => {
    commandList = [commandOf('window.minimize')];

    platform = 'macos';

    const hasMinimizeOnMacos = allEntries(host()).some((item) => item.name === 'window.minimize');

    expect(hasMinimizeOnMacos).toBe(false);

    platform = 'linux';

    const hasMinimizeOnLinux = allEntries(host()).some((item) => item.name === 'window.minimize');

    expect(hasMinimizeOnLinux).toBe(true);
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

  test('keeps each entry id as its command and arguments, which Recent saves', () => {
    commandList = ['tab.new', 'pane.split', 'pane.go', 'space.next', 'mod.open'].map(commandOf);

    const entries = allEntries(host());
    const ids = entries.map((item) => item.id);

    expect(ids).toContain('pane.split:{"direction":"right"}');
    expect(ids).toContain('mod.open:{"name":"koja-picker"}');

    expect(entries.every((item) => item.id === `${item.name}:${JSON.stringify(item.args)}`)).toBe(
      true,
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('finds an unknown command by its words, with underscores read as spaces', () => {
    commandList = [commandOf('weird.some_thing')];

    const rows = paletteRows(allEntries(host()), 'some thing', []);

    expect(rows.map((row) => row.entry.name)).toEqual(['weird.some_thing']);
  });

  test('finds a command that has no verb by its name', () => {
    commandList = [commandOf('weird')];

    const rows = paletteRows(allEntries(host()), 'weird', []);

    expect(rows.map((row) => row.entry.name)).toEqual(['weird']);
  });

  test('offers moving the tab one step each way when the app knows tab.move', () => {
    commandList = [commandOf('tab.move')];

    const moves = allEntries(host())
      .filter((item) => item.name === 'tab.move')
      .map((item) => item.args);

    expect(moves).toEqual([{ by: -1 }, { by: 1 }]);
  });

  test('gives a pane move its direction icon', () => {
    commandList = [commandOf('pane.go')];

    const moves = allEntries(host()).filter((item) => item.name === 'pane.go');
    const directionIcons = moves.map((item) => [item.args['direction'], item.icon]);

    expect(directionIcons).toEqual([
      ['left', 'columns-2'],
      ['right', 'columns-2'],
      ['up', 'rows-2'],
      ['down', 'rows-2'],
    ]);
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

    expect(items.map((item) => item.id)).toEqual([
      'layout.switch:{"name":"main"}',
      'layout.switch:{"name":"win98"}',
      'layout.switch:{"name":"custom"}',
    ]);

    expect(paletteRows(items, 'look', [])).toHaveLength(3);
  });

  test('finds layouts by the words of their friendly titles', () => {
    commandList = [];
    layoutList = ['main', 'win98', 'custom'];

    const rows = paletteRows(allEntries(host()), 'herdr', []);

    expect(rows.map((row) => row.entry.args)).toEqual([{ name: 'main' }, { name: 'win98' }]);
  });

  test('carries the theme name in each theme row', () => {
    commandList = [commandOf('app.theme')];
    themeList = [themeOf('graphite', false)];

    const item = allEntries(host()).find((entryItem) => entryItem.name === 'app.theme');

    expect(item?.args).toEqual({ name: 'graphite' });
    expect(item?.id).toBe('app.theme:{"name":"graphite"}');
    expect(item?.group).toBe('App');

    const themeEntries = item === undefined ? [] : [item];

    expect(paletteRows(themeEntries, 'colors look', [])).toHaveLength(1);
  });
});

const palette = (mod: string, entries: unknown[]): ModPalette => ({ mod, entries });

describe('mod entries', () => {
  const entriesOf = (entries: unknown[], mod = 'koja-gallery'): Entry[] =>
    allEntries(host(), [palette(mod, entries)]);

  const added = (value: unknown): boolean =>
    entriesOf([value]).some((item) => item.title === 'Do the thing');

  test('adds an entry for a command the app knows, in the Mod group', () => {
    commandList = [{ name: 'tab.new', args: [{ name: 'name', required: false }], about: '' }];

    const item = entriesOf([
      { title: 'Do the thing', command: 'tab.new', args: { name: 'api' }, words: 'start' },
    ]).find((found) => found.title === 'Do the thing');

    expect(item?.group).toBe('Mod');
    expect(item?.args).toEqual({ name: 'api' });
    expect(item?.words).toBe('start koja-gallery');
    expect(item?.id).toBe('tab.new:{"name":"api"}');
  });

  test('keeps a group the entry declares, but not Recent', () => {
    commandList = [];

    const groupOf = (group: string): string | undefined =>
      entriesOf([{ title: 'Do the thing', command: 'koja-gallery.open', group }]).find(
        (item) => item.title === 'Do the thing',
      )?.group;

    expect(groupOf('Work')).toBe('Work');
    expect(groupOf('Recent')).toBe('Mod');
  });

  test('rejects an entry with no title, a blank title, or no command', () => {
    commandList = [];

    expect(added({ command: 'koja-gallery.open' })).toBe(false);
    expect(added({ title: '  ', command: 'koja-gallery.open' })).toBe(false);
    expect(added({ title: 'Do the thing' })).toBe(false);
  });

  test('rejects an argument the command does not take', () => {
    commandList = [{ name: 'tab.new', args: [], about: '' }];

    expect(added({ title: 'Do the thing', command: 'tab.new', args: { bogus: 'x' } })).toBe(false);
  });

  test('rejects a missing required argument and accepts a given one', () => {
    commandList = [{ name: 'tab.new', args: [{ name: 'name', required: true }], about: '' }];

    expect(added({ title: 'Do the thing', command: 'tab.new' })).toBe(false);
    expect(added({ title: 'Do the thing', command: 'tab.new', args: { name: 'api' } })).toBe(true);
  });

  test('lets a rename leave its name out for the prompt to ask', () => {
    commandList = [{ name: 'tab.rename', args: [{ name: 'name', required: true }], about: '' }];

    expect(added({ title: 'Do the thing', command: 'tab.rename', args: { name: null } })).toBe(
      true,
    );
  });

  test('rejects a target argument that is not a string', () => {
    commandList = [{ name: 'pane.split', args: [{ name: 'pane', required: false }], about: '' }];

    expect(added({ title: 'Do the thing', command: 'pane.split', args: { pane: 3 } })).toBe(false);

    expect(added({ title: 'Do the thing', command: 'pane.split', args: { pane: 'pane-1' } })).toBe(
      true,
    );

    expect(added({ title: 'Do the thing', command: 'pane.split', args: { pane: null } })).toBe(
      true,
    );
  });

  test("accepts a mod's own command only with no arguments and its own name", () => {
    commandList = [];

    expect(added({ title: 'Do the thing', command: 'koja-gallery.open' })).toBe(true);

    expect(added({ title: 'Do the thing', command: 'koja-gallery.open', args: { x: 1 } })).toBe(
      false,
    );

    expect(added({ title: 'Do the thing', command: 'koja-picker.open' })).toBe(false);
    expect(added({ title: 'Do the thing', command: 'koja-gallery.' })).toBe(false);
  });

  test('lists an entry the palette already offers once', () => {
    commandList = [commandOf('tab.new')];

    const duplicates = entriesOf([{ title: 'Do the thing', command: 'tab.new' }]).filter(
      (item) => item.name === 'tab.new',
    );

    expect(duplicates).toHaveLength(1);
  });

  test('sorts the argument keys in the entry identity', () => {
    commandList = [
      {
        name: 'layout.resize',
        args: [
          { name: 'id', required: true },
          { name: 'px', required: true },
        ],
        about: '',
      },
    ];

    const item = entriesOf([
      { title: 'Do the thing', command: 'layout.resize', args: { px: 240, id: 'sidebar' } },
    ]).find((found) => found.title === 'Do the thing');

    expect(item?.id).toBe('layout.resize:{"id":"sidebar","px":240}');
  });

  test('lists a mod entry after the window group and before the app group', () => {
    commandList = [commandOf('window.close'), commandOf('app.help')];

    const rows = paletteRows(
      entriesOf([{ title: 'Do the thing', command: 'koja-gallery.open' }]),
      '',
      [],
    );

    const heads = rows.map((row) => row.head);

    expect(heads.indexOf('Mod')).toBeGreaterThan(heads.indexOf('Window'));
    expect(heads.indexOf('Mod')).toBeLessThan(heads.indexOf('App'));
  });
});

describe('paletteRows', () => {
  test('lists recent first, then the rest in group order', () => {
    const all = [
      entry('a', 'a', 'Tab', 'A'),
      entry('b', 'b', 'Pane', 'B'),
      entry('c', 'c', 'Weird', 'C'),
    ];

    const headings = paletteRows(all, '', ['b']).map((row) => row.head);

    expect(headings).toEqual(['Recent', 'Tab', 'Weird']);
  });

  test('keeps only entries the query matches', () => {
    const all = [entry('a', 'a', 'Tab', 'New tab'), entry('b', 'b', 'Pane', 'Zoom pane')];

    const matchedIds = paletteRows(all, 'new', []).map((row) => row.entry.id);

    expect(matchedIds).toEqual(['a']);
  });

  test('ranks the command whose words match a spaced query first', () => {
    commandList = [commandOf('weird.some_thing'), commandOf('weird.something')];

    const rows = paletteRows(allEntries(host()), 'some thing', []);

    expect(rows.map((row) => ({ name: row.entry.name, args: row.entry.args }))).toEqual([
      { name: 'weird.something', args: {} },
      { name: 'weird.some_thing', args: {} },
    ]);
  });

  test('lists a layout action before a terminal command in an empty search', () => {
    commandList = [commandOf('terminal.open')];
    layoutList = ['main'];

    const rows = paletteRows(allEntries(host()), '', []);

    expect(rows.map((row) => ({ name: row.entry.name, args: row.entry.args }))).toEqual([
      { name: 'layout.switch', args: { name: 'main' } },
      { name: 'terminal.open', args: {} },
    ]);
  });

  test('finds a layout by the group word in its search text', () => {
    commandList = [];
    layoutList = ['main'];

    const rows = paletteRows(allEntries(host()), 'layout layout herdr', []);

    expect(rows.map((row) => ({ name: row.entry.name, args: row.entry.args }))).toEqual([
      { name: 'layout.switch', args: { name: 'main' } },
    ]);
  });

  test('ranks a command named without a verb ahead of its dotted sibling', () => {
    commandList = [commandOf('weird'), commandOf('weird.run')];

    const rows = paletteRows(allEntries(host()), 'weird', []);

    expect(rows.map((row) => ({ name: row.entry.name, args: row.entry.args }))).toEqual([
      { name: 'weird', args: {} },
      { name: 'weird.run', args: {} },
    ]);
  });

  test('ranks a recent entry first when scores tie', () => {
    const all = [entry('a', 'a', 'Tab', 'Alpha'), entry('b', 'b', 'Tab', 'Alpha')];

    const rankedIds = paletteRows(all, 'alp', ['b']).map((row) => row.entry.id);

    expect(rankedIds).toEqual(['b', 'a']);
  });

  test('keeps the ranked order when the input already has it', () => {
    const all = [entry('b', 'b', 'Tab', 'Alpha'), entry('a', 'a', 'Tab', 'Alpha')];

    const rankedIds = paletteRows(all, 'alp', ['b']).map((row) => row.entry.id);

    expect(rankedIds).toEqual(['b', 'a']);
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

    const matchedIds = paletteRows([wordsOnly, titleOnly], 'new', []).map((row) => row.entry.id);

    expect(matchedIds).toEqual(['a', 'b']);
  });

  test('ignores a recent id that is no longer in the list', () => {
    const all = [entry('a', 'a', 'Tab', 'A')];

    const headings = paletteRows(all, '', ['gone']).map((row) => row.head);

    expect(headings).toEqual(['Tab']);
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

    const listedIds = paletteRows(all, '', []).map((row) => row.entry.id);

    expect(listedIds).toEqual([]);
  });

  test('ignores the case and spacing a query uses', () => {
    const all = [entry('a', 'a', 'Tab', 'New tab')];

    const matchedIds = paletteRows(all, '  NEW   TAB ', []).map((row) => row.entry.id);

    expect(matchedIds).toEqual(['a']);
  });

  test('reports no highlight positions for a listing without a query', () => {
    const all = [entry('a', 'a', 'Tab', 'A'), entry('b', 'b', 'Pane', 'B')];

    const positions = paletteRows(all, '', ['a']).map((row) => row.positions);

    expect(positions).toEqual([[], []]);
  });
});

describe('headingOf', () => {
  test('names a known group with its part letter', () => {
    expect(headingOf('Tab')).toEqual({ label: 'Tabs', letter: 't' });
  });

  test('falls back to the group name without a part letter', () => {
    expect(headingOf('Filler')).toEqual({ label: 'Filler', letter: null });
  });
});

describe('entryHint', () => {
  test('prefers the action with the entry argument', () => {
    const item = {
      ...entry('a', 'pane.split', 'Pane', 'Split right'),
      args: { direction: 'right' },
    };

    expect(entryHint(item, splitRightHint)).toEqual({ normal: ['ctrl-shift-o'] });
  });

  test('answers an empty normal hint without a binding', () => {
    expect(
      entryHint(entry('a', 'pane.split', 'Pane', 'Split right'), () => ({ normal: [] })),
    ).toEqual({ normal: [] });
  });

  test('does not fall back to the bare command for a named layout', () => {
    const item = {
      ...entry('a', 'layout.switch', 'Layout', 'Layout: Herdr'),
      args: { name: 'main' },
    };

    expect(entryHint(item, layoutHint)).toEqual({ normal: [] });
  });
});

describe('paletteCount', () => {
  test('counts every command with an empty query and only the matches with a query', () => {
    const all = [
      entry('a', 'tab.new', 'Tab', 'New tab'),
      entry('b', 'pane.close', 'Pane', 'Close pane'),
    ];

    expect(paletteCount(all, paletteRows(all, '', []), '')).toEqual({
      filtered: false,
      count: 2,
    });

    expect(paletteCount(all, paletteRows(all, 'close', []), 'close')).toEqual({
      filtered: true,
      count: 1,
    });

    expect(paletteCount(all, paletteRows(all, '   ', []), '   ')).toEqual({
      filtered: false,
      count: 2,
    });
  });
});
