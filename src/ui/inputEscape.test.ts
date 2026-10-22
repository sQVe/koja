import { expect, it } from 'bun:test';

import { ModeFlag } from '../rows/rows.ts';
import { createInputHarness, encoder } from './inputFixtures.ts';
import { createInputTokenizer } from './inputTokens.ts';

const lone = { kind: 'key', raw: '\x1b', escapeSent: false } as const;
const arrow = { kind: 'key', raw: '\x1b[A', escapeSent: true } as const;
const split = { kind: 'paste', bytes: encoder.encode('hi'), escapeSent: true } as const;

it('drops the sent Escape from a split arrow when the Escape reached the pane', () => {
  const { input, sent } = createInputHarness('insert', {}, ModeFlag.applicationCursorKeys);

  input(lone);
  input(arrow);

  expect(sent).toEqual(['\x1b', 'OA']);
});

it('sends the whole split arrow when normal mode consumed the Escape', () => {
  const { input, sent, mode } = createInputHarness('normal', {}, ModeFlag.applicationCursorKeys);

  input(lone);
  input(arrow);

  expect(sent).toEqual(['\x1bOA']);
  expect(mode()).toBe('insert');
});

it('drops the sent Escape from a split paste only when the Escape reached the pane', () => {
  const inserted = createInputHarness('insert', {}, ModeFlag.bracketedPaste);

  inserted.input(lone);
  inserted.input(split);

  expect(inserted.sent).toEqual(['\x1b', '[200~hi\x1b[201~']);

  const normal = createInputHarness('normal', {}, ModeFlag.bracketedPaste);

  normal.input(lone);
  normal.input(split);

  expect(normal.sent).toEqual(['\x1b[200~hi\x1b[201~']);
});

it('sends a paste after a sent Escape without bracketed paste as it is', () => {
  const { input, sent } = createInputHarness('insert');

  input(lone);
  input(split);

  expect(sent).toEqual(['\x1b', 'hi']);
});

const splitUpArrow = (flags: number, flagsAfterEscape = flags) => {
  const { input, sent, setModes } = createInputHarness('insert', {}, flags << 9);
  const tokenizer = createInputTokenizer();

  for (const token of tokenizer.push(encoder.encode('\x1b'), 0)) {
    if (token.kind === 'key') {
      input(token);
    }
  }

  setModes(flagsAfterEscape << 9);

  for (const token of tokenizer.push(encoder.encode('[A'), 10)) {
    if (token.kind === 'key') {
      input(token);
    }
  }

  return sent.join('');
};

it('sends one Up arrow when a legacy Escape and its continuation arrive in two reads', () => {
  expect(splitUpArrow(0)).toBe('\x1b[A');
  expect(splitUpArrow(1)).toBe('\x1b[27u\x1b[A');
  expect(splitUpArrow(31)).toBe('\x1b[27u\x1b[A');
  expect(splitUpArrow(0, 1)).toBe('\x1b[A');
});
