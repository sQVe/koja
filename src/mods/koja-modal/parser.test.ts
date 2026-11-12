import { describe, expect, test } from 'bun:test';

import type { NormalAction, NormalIntent } from '../../kit/normalKeys.ts';
import type { KeyModifiers, NormalKeyEvent } from './keyEvent.ts';
import { normalizeKey } from './keyEvent.ts';
import type { ParseResult, ParserState } from './parser.ts';
import { initialParserState, parseKey } from './parser.ts';

const noModifiers: KeyModifiers = {
  shift: false,
  control: false,
  alt: false,
  platform: false,
  function: false,
};

const event = (overrides: Partial<NormalKeyEvent>): NormalKeyEvent => ({
  key: '',
  keystroke: '',
  modifiers: noModifiers,
  ...overrides,
});

const control = (key: string, keystroke: string): NormalKeyEvent =>
  event({ key, keystroke, key_char: key, modifiers: { ...noModifiers, control: true } });

const plain = (key: string): NormalKeyEvent => event({ key, keystroke: key, key_char: key });

const named = (key: string, keystroke: string): NormalKeyEvent => event({ key, keystroke });

const step = (state: ParserState, keys: NormalKeyEvent): ParseResult =>
  parseKey(state, normalizeKey(keys), []);

const feed = (keys: NormalKeyEvent[]): ParseResult => {
  let state: ParserState = initialParserState;
  let result: ParseResult = { status: 'pending', state };

  for (const item of keys) {
    result = step(state, item);
    state = result.state;
  }

  return result;
};

const ctrlW = control('w', 'ctrl-w');
const ctrlT = control('t', 'ctrl-t');
const ctrlQ = control('q', 'ctrl-q');

describe('normal mode sequences', () => {
  test('resolves ctrl-w v to split right and leaves no pending state', () => {
    const result = feed([ctrlW, plain('v')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'pane.split', args: { direction: 'right' } },
    });

    expect(result.state).toEqual(initialParserState);
  });

  test('resolves a plain pipe after ctrl-w to zoom', () => {
    const result = feed([ctrlW, plain('|')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'pane.zoom' },
    });
  });

  test('resolves 3gt to the nth tab with count three', () => {
    const result = feed([plain('3'), plain('g'), plain('t')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'nthTab', index: 3 },
    });
  });

  test('resolves g then Tab to the last tab', () => {
    const result = feed([plain('g'), named('tab', 'tab')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'intent', intent: 'lastTab' },
    });
  });

  test('resolves Shift-Tab to the previous section', () => {
    const shiftTab = event({
      key: 'tab',
      keystroke: 'shift-tab',
      key_char: '\t',
      modifiers: { ...noModifiers, shift: true },
    });

    const result = feed([shiftTab]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'section', target: 'previous' },
    });
  });

  test('resolves Tab to the next section', () => {
    expect(feed([named('tab', 'tab')])).toMatchObject({
      status: 'action',
      action: { kind: 'section', target: 'next' },
    });
  });

  test('resolves a bare Escape to the panes section', () => {
    expect(feed([named('escape', 'escape')])).toMatchObject({
      status: 'action',
      action: { kind: 'section', target: 'panes' },
    });
  });

  test('Escape after a pending prefix only clears the prefix', () => {
    const result = feed([plain('g'), named('escape', 'escape')]);

    expect(result).toEqual({ status: 'cleared', state: initialParserState });
  });

  test('resolves the oumlaut to the palette', () => {
    const oumlaut = event({ key: 'semicolon', keystroke: 'ö', key_char: 'ö' });

    const result = feed([oumlaut]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'mod.open', args: { name: 'koja-palette' } },
    });
  });

  test('resolves ctrl-u to half a page up in the terminal', () => {
    const result = feed([control('u', 'ctrl-u')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'terminal.scroll', args: { pages: -0.5 } },
    });
  });

  test('resolves g g to the top of the terminal', () => {
    const result = feed([plain('g'), plain('g')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'terminal.scroll', args: { to: 'top' } },
    });
  });
});

describe('normal mode window chords', () => {
  const twinKeys = ['h', 'j', 'k', 'l', 's', 'n', 'v', 'q', 'o', '_', 'w', 'p'];

  test.each(twinKeys)('resolves ctrl-w ctrl-%s like the plain key after ctrl-w', (key) => {
    const withControl = feed([ctrlW, control(key, `ctrl-${key}`)]);

    const withLetter = feed([ctrlW, plain(key)]);

    expect(withLetter.status).toBe('action');
    expect(withControl).toEqual(withLetter);
  });

  const arrows = [
    ['left', 'h'],
    ['down', 'j'],
    ['up', 'k'],
    ['right', 'l'],
  ] as const;

  test.each(arrows)('resolves ctrl-w %s like ctrl-w %s', (arrow, letter) => {
    const withArrow = feed([ctrlW, named(arrow, arrow)]);

    const withLetter = feed([ctrlW, plain(letter)]);

    expect(withLetter.status).toBe('action');
    expect(withArrow).toEqual(withLetter);
  });

  test.each(arrows)('resolves %s alone like ctrl-%s', (arrow, letter) => {
    const withArrow = feed([named(arrow, arrow)]);

    const withControl = feed([control(letter, `ctrl-${letter}`)]);

    expect(withControl.status).toBe('action');
    expect(withArrow).toEqual(withControl);
  });

  test.each(arrows)('resolves ctrl-%s alone like ctrl-%s', (arrow, letter) => {
    const controlArrow = event({
      key: arrow,
      keystroke: `ctrl-${arrow}`,
      modifiers: { ...noModifiers, control: true },
    });

    const withControlArrow = feed([controlArrow]);

    const withControl = feed([control(letter, `ctrl-${letter}`)]);

    expect(withControl.status).toBe('action');
    expect(withControlArrow).toEqual(withControl);
  });

  test('clears pending on ctrl-w ctrl-c without an action', () => {
    const result = feed([ctrlW, control('c', 'ctrl-c')]);

    expect(result).toMatchObject({ status: 'cleared' });
    expect(result.state).toEqual(initialParserState);
  });
});

describe('normal mode clearing', () => {
  test('clears pending after ctrl-w then an unknown key, and the next gt resolves', () => {
    const afterCtrlW = step(initialParserState, ctrlW);

    const cleared = step(afterCtrlW.state, plain('x'));

    expect(cleared).toMatchObject({ status: 'cleared' });
    expect(cleared.state).toEqual(initialParserState);

    const afterG = step(cleared.state, plain('g'));

    const resolved = step(afterG.state, plain('t'));

    expect(resolved).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'tab.next' },
    });
  });
});

const command = (name: string, args?: Record<string, unknown>): NormalAction => ({
  kind: 'command',
  command: name,
  ...(args === undefined ? {} : { args }),
});

const intent = (name: NormalIntent): NormalAction => ({ kind: 'intent', intent: name });

const palette = command('mod.open', { name: 'koja-palette' });

const partKeys: [string, NormalAction][] = [
  ['w v', command('pane.split', { direction: 'right' })],
  ['w s', command('pane.split', { direction: 'down' })],
  ['w n', command('pane.split', { direction: 'down' })],
  ['w h', command('pane.go', { direction: 'left' })],
  ['w L', command('pane.swap', { direction: 'right' })],
  ['w q', command('pane.close')],
  ['w c', command('pane.close')],
  ['w o', intent('closeOtherPanes')],
  ['w m', command('pane.zoom')],
  ['w |', command('pane.zoom')],
  ['w w', intent('nextPane')],
  ['w W', intent('previousPane')],
  ['w p', intent('lastPane')],
  ['t n', command('tab.new')],
  ['t q', command('tab.close')],
  ['t r', command('tab.rename')],
  ['t h', command('tab.prev')],
  ['t l', command('tab.next')],
  ['s n', command('space.new')],
  ['s q', command('space.close')],
  ['s r', command('space.rename')],
  ['s j', command('space.next')],
  ['s k', command('space.prev')],
  ['z s', command('layout.toggle', { id: 'sidebar' })],
  ['z l', command('layout.switch')],
  ['z +', command('app.zoom_in')],
  ['z -', command('app.zoom_out')],
  ['z 0', command('app.zoom_reset')],
];

const singleKeys: [string, NormalAction][] = [
  ['h', command('pane.go', { direction: 'left' })],
  ['j', command('pane.go', { direction: 'down' })],
  ['k', command('pane.go', { direction: 'up' })],
  ['l', command('pane.go', { direction: 'right' })],
  ['H', command('pane.swap', { direction: 'left' })],
  ['J', command('pane.swap', { direction: 'down' })],
  ['K', command('pane.swap', { direction: 'up' })],
  ['L', command('pane.swap', { direction: 'right' })],
  [':', palette],
  ['/', command('terminal.search')],
  ['?', command('app.help')],
];

const windowSecondKeys = [
  'h',
  'j',
  'k',
  'l',
  'left',
  'down',
  'up',
  'right',
  'H',
  'J',
  'K',
  'L',
  'v',
  's',
  'n',
  'q',
  'c',
  'o',
  'm',
  '_',
  '|',
  'w',
  'W',
  'p',
];

const typed = (sequence: string): NormalKeyEvent[] => sequence.split(' ').map(plain);

describe('normal mode parts', () => {
  test.each(partKeys)('resolves %s to its action', (sequence, action) => {
    const result = feed(typed(sequence));

    expect(result).toEqual({ status: 'action', action, state: initialParserState });
  });

  test.each(singleKeys)('resolves %s alone to its action', (key, action) => {
    expect(feed([plain(key)])).toMatchObject({ status: 'action', action });
  });

  test.each(windowSecondKeys)('resolves ctrl-w then %s like w then the same key', (key) => {
    const withControl = feed([ctrlW, plain(key)]);

    const withLetter = feed([plain('w'), plain(key)]);

    expect(withLetter.status).toBe('action');
    expect(withControl).toEqual(withLetter);
  });

  test.each(['1', '3', '9'])('resolves t %s to select that tab', (digit) => {
    expect(feed([plain('t'), plain(digit)])).toMatchObject({
      status: 'action',
      action: command('tab.select', { index: Number(digit) }),
    });
  });

  test('drops a count before t 3 and selects tab 3', () => {
    expect(feed([plain('5'), plain('t'), plain('3')])).toMatchObject({
      status: 'action',
      action: command('tab.select', { index: 3 }),
    });
  });

  test.each(['w', 't', 's', 'z'])('waits for a second key after %s', (key) => {
    expect(feed([plain(key)])).toMatchObject({ status: 'pending', state: { pending: [key] } });
  });

  test.each([
    ['ctrl-t', ctrlT],
    ['ctrl-q', ctrlQ],
  ])('ignores %s instead of waiting for a second key', (_name, prefix) => {
    const result = feed([prefix]);

    expect(result).toEqual({ status: 'cleared', state: initialParserState });
  });

  test.each(['n', 'p', 'q', 'w'])('runs nothing for ctrl-q then ctrl-%s', (key) => {
    const result = feed([ctrlQ, control(key, `ctrl-${key}`)]);

    expect(result.status).not.toBe('action');
  });

  test.each(['n', 'p', 'q', 'w'])('runs nothing for ctrl-t then ctrl-%s', (key) => {
    const result = feed([ctrlT, control(key, `ctrl-${key}`)]);

    expect(result.status).not.toBe('action');
  });
});

describe('normal mode counts and chords', () => {
  test('drops the count before gT and runs previous tab once', () => {
    const result = feed([plain('3'), plain('g'), plain('T')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'tab.prev' },
    });
  });

  test('caps a long count at 999', () => {
    const result = feed([plain('9'), plain('9'), plain('9'), plain('9'), plain('g'), plain('t')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'nthTab', index: 999 },
    });
  });

  test('does not start a count on zero', () => {
    const result = feed([plain('0')]);

    expect(result).toMatchObject({ status: 'cleared' });
  });

  test('does not leave normal mode on ctrl-i', () => {
    const result = feed([control('i', 'ctrl-i')]);

    expect(result.status).toBe('cleared');

    expect(result).not.toMatchObject({
      status: 'action',
      action: { kind: 'leave' },
    });
  });
});

describe('normal mode palette', () => {
  test('resolves Backspace to the palette', () => {
    expect(feed([named('backspace', 'backspace')])).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'mod.open', args: { name: 'koja-palette' } },
    });
  });

  test('resolves s f and the aumlaut to the picker', () => {
    const aumlaut = event({ key: 'quote', keystroke: 'ä', key_char: 'ä' });

    for (const keys of [[plain('s'), plain('f')], [aumlaut]]) {
      expect(feed(keys)).toMatchObject({
        status: 'action',
        action: { kind: 'command', command: 'mod.open', args: { name: 'koja-picker' } },
      });
    }
  });

  test('does not open the picker for Space Space', () => {
    const result = feed([named('space', 'space'), named('space', 'space')]);

    expect(result).not.toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'mod.open', args: { name: 'koja-picker' } },
    });
  });

  test('resolves the leave-normal-mode keys', () => {
    for (const leave of [plain('i'), plain('a'), named('enter', 'enter')]) {
      expect(feed([leave])).toMatchObject({
        status: 'action',
        action: { kind: 'leave' },
      });
    }
  });
});
