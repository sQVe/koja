import { describe, expect, test } from 'bun:test';

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
  parseKey(state, normalizeKey(keys));

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
      action: { kind: 'command', command: 'pane.split:right' },
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

  test('resolves Shift-Tab to the previous space', () => {
    const shiftTab = event({
      key: 'tab',
      keystroke: 'shift-tab',
      key_char: '\t',
      modifiers: { ...noModifiers, shift: true },
    });

    const result = feed([shiftTab]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'intent', intent: 'previousSpace' },
    });
  });

  test('resolves the oumlaut to the palette', () => {
    const oumlaut = event({ key: 'semicolon', keystroke: 'ö', key_char: 'ö' });

    const result = feed([oumlaut]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'mod.open:koja-palette' },
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

describe('normal mode tab chords', () => {
  test('resolves ctrl-t ctrl-n to the next tab', () => {
    const result = feed([ctrlT, control('n', 'ctrl-n')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'tab.next' },
    });
  });

  test('resolves ctrl-t n to the next tab', () => {
    const result = feed([ctrlT, plain('n')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'tab.next' },
    });
  });

  test('resolves ctrl-t ctrl-w to a new tab', () => {
    const result = feed([ctrlT, control('w', 'ctrl-w')]);

    expect(result).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'tab.new' },
    });
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

describe('normal mode agents and palette', () => {
  test('resolves the ctrl-q agent chords', () => {
    expect(feed([ctrlQ, plain('n')])).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'agent.next' },
    });

    expect(feed([ctrlQ, control('p', 'ctrl-p')])).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'agent.prev' },
    });
  });

  test('resolves Backspace and Space Space', () => {
    expect(feed([named('backspace', 'backspace')])).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'mod.open:koja-palette' },
    });

    expect(feed([named('space', 'space'), named('space', 'space')])).toMatchObject({
      status: 'action',
      action: { kind: 'command', command: 'mod.open:koja-picker' },
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
