import { expect, it } from 'bun:test';

import { encodeKey, isKey, keyModifier, keyText, parseKey } from './keyEncoding.ts';

const decoder = new TextDecoder();

const encoded = (raw: string, flags: number, applicationCursor = false): string =>
  decoder.decode(encodeKey(parseKey(raw), flags, applicationCursor));

it('encodes ctrl+a as a control byte for flags 0 and as CSI u for flags 1', () => {
  expect(encoded('\x1b[97;5u', 0)).toBe('\x01');
  expect(encoded('\x1b[97;5u', 1)).toBe('\x1b[97;5u');
});

const legacyKeys = [
  'a',
  'Z',
  '<',
  'é',
  '\x01',
  '\x02',
  '\r',
  '\t',
  '\x7f',
  '\x1b',
  '\x1ba',
  '\x1b\x7f',
  '\x1b[A',
  '\x1b[B',
  '\x1b[C',
  '\x1b[D',
  '\x1b[H',
  '\x1b[F',
  '\x1b[1;5C',
  '\x1b[1;3A',
  '\x1b[Z',
  '\x1bOP',
  '\x1b[11~',
  '\x1b[15~',
  '\x1b[2~',
  '\x1b[3~',
  '\x1b[5~',
  '\x1b[6~',
  '\x1b[3;5~',
  '\x1b[[A',
];

it('sends every legacy key unchanged for flags 0', () => {
  for (const raw of legacyKeys) {
    expect(encoded(raw, 0)).toBe(raw);
  }
});

it('sends application cursor keys for flags 0 only when the pane asks', () => {
  for (const tail of ['A', 'B', 'C', 'D', 'H', 'F']) {
    expect(encoded(`\x1b[${tail}`, 0, true)).toBe(`\x1bO${tail}`);
    expect(encoded(`\x1b[${tail}`, 0, false)).toBe(`\x1b[${tail}`);
  }

  expect(encoded('\x1b[1;5C', 0, true)).toBe('\x1b[1;5C');
});

it('encodes kitty keys as the legacy bytes for flags 0', () => {
  expect(encoded('\x1b[98;5u', 0)).toBe('\x02');
  expect(encoded('\x1b[97;3u', 0)).toBe('\x1ba');
  expect(encoded('\x1b[97;2u', 0)).toBe('A');
  expect(encoded('\x1b[13u', 0)).toBe('\r');
  expect(encoded('\x1b[27u', 0)).toBe('\x1b');
  expect(encoded('\x1b[127u', 0)).toBe('\x7f');
  expect(encoded('\x1b[9;2u', 0)).toBe('\x1b[Z');
  expect(encoded('\x1b[1;2A', 0)).toBe('\x1b[1;2A');
  expect(encoded('\x1b[3;3~', 0)).toBe('\x1b[3;3~');
  expect(encoded('\x1b[1;1:2A', 0)).toBe('\x1b[A');
});

it('sends no bytes for a release without flag 2', () => {
  expect(encoded('\x1b[97;1:3u', 0)).toBe('');
  expect(encoded('\x1b[97;5:3u', 1)).toBe('');
  expect(encoded('\x1b[1;1:3A', 1 | 4 | 16)).toBe('');
});

it('sends a repeat as a press without flag 2', () => {
  expect(encoded('\x1b[97;5:2u', 0)).toBe('\x01');
  expect(encoded('\x1b[97;5:2u', 1)).toBe('\x1b[97;5u');
  expect(encoded('\x1b[1;1:2A', 0)).toBe('\x1b[A');
});

it('carries the event type of a release and a repeat with flag 2', () => {
  expect(encoded('\x1b[97;5:3u', 3)).toBe('\x1b[97;5:3u');
  expect(encoded('\x1b[97;5:2u', 3)).toBe('\x1b[97;5:2u');
  expect(encoded('\x1b[97;1:3u', 2)).toBe('\x1b[97;1:3u');
  expect(encoded('\x1b[1;1:3A', 2)).toBe('\x1b[1;1:3A');
  expect(encoded('\x1b[1;5:3A', 2)).toBe('\x1b[1;5:3A');
  expect(encoded('\x1b[3;1:3~', 2)).toBe('\x1b[3;1:3~');
  expect(encoded('\x1b[27;1:3u', 2)).toBe('\x1b[27;1:3u');
});

it('does not report a plain editing key release or a repeat of text', () => {
  expect(encoded('\x1b[13;1:3u', 2)).toBe('');
  expect(encoded('\x1b[9;1:3u', 2)).toBe('');
  expect(encoded('\x1b[127;1:3u', 2)).toBe('');
  expect(encoded('\x1b[13;1:2u', 2)).toBe('\r');
  expect(encoded('\x1b[97;1:2u', 2)).toBe('a');
});

it('sends a press of text as text unless a modifier or flag 8 asks for an escape', () => {
  expect(encoded('a', 1)).toBe('a');
  expect(encoded('A', 1)).toBe('A');
  expect(encoded('\r', 1)).toBe('\r');
  expect(encoded('\x1b[97;2u', 1)).toBe('A');
  expect(encoded('\x1b[97;3u', 1)).toBe('\x1b[97;3u');
  expect(encoded('\x1b[13;5u', 1)).toBe('\x1b[13;5u');
  expect(encoded('\x1b', 1)).toBe('\x1b[27u');
  expect(encoded('\x1b', 2)).toBe('\x1b');
});

it('adds alternate keys only with flag 4', () => {
  expect(encoded('\x1b[97:65;2u', 1 | 8)).toBe('\x1b[97;2u');
  expect(encoded('\x1b[97:65;2u', 1 | 4 | 8)).toBe('\x1b[97:65;2u');
  expect(encoded('\x1b[97:65:99;2u', 1 | 4 | 8)).toBe('\x1b[97:65:99;2u');
  expect(encoded('\x1b[97::99;5u', 1 | 4)).toBe('\x1b[97::99;5u');
  expect(encoded('\x1b[97;6u', 1 | 4)).toBe('\x1b[97:65;6u');
  expect(encoded('\x1b[97;5u', 1 | 4)).toBe('\x1b[97;5u');
});

it('sends all keys as escapes only with flag 8', () => {
  expect(encoded('a', 8)).toBe('\x1b[97u');
  expect(encoded('\r', 8)).toBe('\x1b[13u');
  expect(encoded('\t', 8)).toBe('\x1b[9u');
  expect(encoded('\x7f', 8)).toBe('\x1b[127u');
  expect(encoded('\x1b', 8)).toBe('\x1b[27u');
  expect(encoded('\x1b[A', 8)).toBe('\x1b[A');
  expect(encoded('\x1b[13;1:3u', 8 | 2)).toBe('\x1b[13;1:3u');
});

it('adds associated text only with flag 16', () => {
  expect(encoded('\x1b[97;1;97u', 8)).toBe('\x1b[97u');
  expect(encoded('\x1b[97;1;97u', 8 | 16)).toBe('\x1b[97;1;97u');
  expect(encoded('\x1b[97;2;65u', 8 | 16)).toBe('\x1b[97;2;65u');
  expect(encoded('\x1b[97;1;228:776u', 8 | 16)).toBe('\x1b[97;1;228:776u');
  expect(encoded('a', 8 | 16)).toBe('\x1b[97;1;97u');
  expect(encoded('A', 8 | 16)).toBe('\x1b[97;2;65u');
  expect(encoded('\x1b[97;5u', 8 | 16)).toBe('\x1b[97;5u');
  expect(encoded('\r', 8 | 16)).toBe('\x1b[13u');
});

it('sends no text with a printable key release', () => {
  expect(encoded('\x1b[97;1:3u', 2 | 8 | 16)).toBe('\x1b[97;1:3u');
  expect(encoded('\x1b[97;1:3;97u', 2 | 8 | 16)).toBe('\x1b[97;1:3u');
  expect(encoded('\x1b[97;1:3;97u', 2)).toBe('\x1b[97;1:3u');
});

it('sends no bytes for keypad and modifier-only keys', () => {
  for (const raw of ['\x1b[57399u', '\x1b[57441;2u', '\x1b[57417u', '\x1b[1;5E']) {
    for (const flags of [0, 1, 31]) {
      expect(encoded(raw, flags)).toBe('');
    }
  }
});

it('passes bytes it does not parse through unchanged', () => {
  expect(encoded('\x1b[<0;1;1M', 0)).toBe('\x1b[<0;1;1M');
  expect(encoded('\x1b[<0;1;1M', 31)).toBe('\x1b[<0;1;1M');
});

it('parses the keys a router matches on', () => {
  const ctrlB = parseKey('\x1b[98;5u');
  const legacyCtrlB = parseKey('\x02');
  const escapeKey = parseKey('\x1b[27u');
  const typedLess = parseKey('\x1b[44:60;2;60u');
  const typedJ = parseKey('\x1b[106;1;106u');

  expect(isKey(ctrlB, 'b', keyModifier.ctrl)).toBe(true);
  expect(isKey(legacyCtrlB, 'b', keyModifier.ctrl)).toBe(true);
  expect(isKey(parseKey('\x1b[98;133u'), 'b', keyModifier.ctrl)).toBe(true);
  expect(isKey(parseKey('\x1b[98;5:3u'), 'b', keyModifier.ctrl)).toBe(false);
  expect(isKey(escapeKey, 'escape')).toBe(true);
  expect(isKey(parseKey('\x1b'), 'escape')).toBe(true);
  expect(keyText(typedLess)).toBe('<');
  expect(keyText(parseKey('<'))).toBe('<');
  expect(keyText(typedJ)).toBe('j');
  expect(keyText(parseKey('\x1b[106;1:3;106u'))).toBeUndefined();
  expect(keyText(ctrlB)).toBeUndefined();
});

it('sends F1 to F4 and application cursor keys as CSI forms under kitty flags', () => {
  expect(encoded('\x1bOP', 1)).toBe('\x1b[P');
  expect(encoded('\x1b[A', 1, true)).toBe('\x1b[A');
  expect(encoded('\x1b[1;5A', 1, true)).toBe('\x1b[1;5A');
  expect(encoded('\x1b[1;1:3A', 2, true)).toBe('\x1b[1;1:3A');
  expect(encoded('\x1b[A', 0, true)).toBe('\x1bOA');
  expect(encoded('\x1bOP', 0)).toBe('\x1bOP');
});

it('sends F3 as a tilde sequence under kitty flags', () => {
  expect(encoded('\x1bOR', 1)).toBe('\x1b[13~');
  expect(encoded('\x1b[13;1:3~', 2)).toBe('\x1b[13;1:3~');
  expect(encoded('\x1b[13;5~', 1)).toBe('\x1b[13;5~');
  expect(encoded('\x1b[1;5R', 31)).toBe('\x1b[13;5~');
  expect(encoded('\x1bOR', 0)).toBe('\x1bOR');
});

it('drops invalid alternate codepoints instead of throwing', () => {
  for (const flags of [0, 1, 4, 31]) {
    expect(() => encoded('\x1b[97:1114112;2u', flags)).not.toThrow();
    expect(() => encoded('\x1b[97:55296:1114112;2u', flags)).not.toThrow();
  }

  expect(encoded('\x1b[97:1114112;2u', 0)).toBe('A');
  expect(encoded('\x1b[97:1114112:98;5u', 1 | 4)).toBe('\x1b[97::98;5u');
});
