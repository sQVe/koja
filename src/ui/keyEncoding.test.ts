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

it('parses tilde sequences to the keys of their number under kitty flags', () => {
  const sameBytes = [
    '\x1b[2~',
    '\x1b[3~',
    '\x1b[5~',
    '\x1b[6~',
    '\x1b[15~',
    '\x1b[17~',
    '\x1b[18~',
  ];

  for (const raw of [...sameBytes, '\x1b[19~', '\x1b[20~', '\x1b[21~', '\x1b[23~', '\x1b[24~']) {
    expect(encoded(raw, 1)).toBe(raw);
  }

  expect(encoded('\x1b[1~', 1)).toBe('\x1b[H');
  expect(encoded('\x1b[7~', 1)).toBe('\x1b[H');
  expect(encoded('\x1b[4~', 1)).toBe('\x1b[F');
  expect(encoded('\x1b[8~', 1)).toBe('\x1b[F');
  expect(encoded('\x1b[11~', 1)).toBe('\x1b[P');
  expect(encoded('\x1b[12~', 1)).toBe('\x1b[Q');
  expect(encoded('\x1b[13~', 1)).toBe('\x1b[13~');
  expect(encoded('\x1b[14~', 1)).toBe('\x1b[S');
});

it('names the key of each tilde number', () => {
  const names = new Map([
    ['\x1b[2~', 'insert'],
    ['\x1b[3~', 'delete'],
    ['\x1b[5~', 'pageUp'],
    ['\x1b[6~', 'pageDown'],
    ['\x1b[15~', 'f5'],
    ['\x1b[17~', 'f6'],
    ['\x1b[18~', 'f7'],
    ['\x1b[19~', 'f8'],
    ['\x1b[20~', 'f9'],
    ['\x1b[21~', 'f10'],
    ['\x1b[23~', 'f11'],
    ['\x1b[24~', 'f12'],
    ['\x1b[1~', 'home'],
    ['\x1b[4~', 'end'],
    ['\x1b[7~', 'home'],
    ['\x1b[8~', 'end'],
    ['\x1b[11~', 'f1'],
    ['\x1b[12~', 'f2'],
    ['\x1b[13~', 'f3'],
    ['\x1b[14~', 'f4'],
  ]);

  for (const [raw, key] of names) {
    expect(parseKey(raw).key).toBe(key);
  }

  expect(parseKey('\x1b[99~').key).toBe('opaque');
});

it('sends a tilde release only with flag 2', () => {
  expect(encoded('\x1b[3;1:3~', 1)).toBe('');
  expect(encoded('\x1b[3;1:3~', 2)).toBe('\x1b[3;1:3~');
});

it('does not send control characters as associated text', () => {
  for (const code of [0, 7, 9, 27, 31, 127, 128, 159]) {
    expect(encoded(`\x1b[97;1;${code}u`, 8 | 16)).toBe('\x1b[97u');
  }

  for (const code of [32, 126, 160, 233]) {
    expect(encoded(`\x1b[97;1;${code}u`, 8 | 16)).toBe(`\x1b[97;1;${code}u`);
  }

  expect(encoded('\x1b[97;1;97:7u', 8 | 16)).toBe('\x1b[97u');
});

it('drops invalid code points without a throw', () => {
  for (const flags of [0, 1, 8 | 16, 31]) {
    for (const raw of ['\x1b[u', '\x1b[;5u', '\x1b[55296u', '\x1b[57343u', '\x1b[1114112u']) {
      expect(encoded(raw, flags)).toBe('');
    }
  }

  const invalidTexts = ['55296', '1114112', '', '98:55296', '98::99', '98:'];

  for (const text of invalidTexts) {
    expect(encoded(`\x1b[97;1;${text}u`, 8 | 16)).toBe('\x1b[97;1;97u');
  }

  expect(encoded('\x1b[97;1;1114111u', 8 | 16)).toBe('\x1b[97;1;1114111u');
  expect(encoded('\x1b[97:55296;2u', 4)).toBe('A');
  expect(encoded('\x1b[97:98:55296;5u', 1 | 4)).toBe('\x1b[97:98;5u');
});

it('keeps valid characters above U+D7FF as keys', () => {
  expect(encoded('\x1b[128512u', 1)).toBe('😀');
  expect(encoded('\x1b[63744u', 1)).toBe(String.fromCodePoint(63744));
  expect(encoded('\x1b[55295u', 1)).toBe('\ud7ff');
  expect(encoded('\x1b[128512;1;128512u', 8 | 16)).toBe('\x1b[128512;1;128512u');
  expect(encoded('\x1b[57344u', 1)).toBe('');
  expect(encoded('\x1b[983040u', 1)).toBe('');
  expect(parseKey('\x1b[128512u').key).toBe('😀');
  expect(parseKey('\x1b[63744u').key).toBe(String.fromCodePoint(63744));
});

it('passes sequences it does not parse through unchanged under kitty flags', () => {
  for (const raw of ['\x1b[2^', '\x1b[?1A', '\x1bOx', '\x1b[99~', '\x1b[1;5x']) {
    for (const flags of [0, 1, 31]) {
      expect(encoded(raw, flags)).toBe(raw);
    }
  }

  expect(encoded('\x1b[?1A', 1, true)).toBe('\x1b[?1A');
});

it('parses legacy control bytes as Ctrl plus the key', () => {
  expect(encoded('\x00', 1)).toBe('\x1b[32;5u');
  expect(encoded('\x01', 1)).toBe('\x1b[97;5u');
  expect(encoded('\x02', 1)).toBe('\x1b[98;5u');
  expect(encoded('\x1a', 1)).toBe('\x1b[122;5u');
  expect(encoded('\x1c', 1)).toBe('\x1b[92;5u');
  expect(encoded('\x1d', 1)).toBe('\x1b[93;5u');
  expect(encoded('\x1e', 1)).toBe('\x1b[94;5u');
  expect(encoded('\x1f', 1)).toBe('\x1b[95;5u');
  expect(encoded('\x1b', 1)).toBe('\x1b[27u');
  expect(encoded(' ', 1)).toBe(' ');
  expect(encoded(' ', 8)).toBe('\x1b[32u');

  for (const raw of ['\x00', '\x1a', '\x1c', '\x1f']) {
    expect(isKey(parseKey(raw), 'a', keyModifier.ctrl)).toBe(raw === '\x01');
  }

  expect(isKey(parseKey('\x1a'), 'z', keyModifier.ctrl)).toBe(true);
  expect(isKey(parseKey('\x00'), ' ', keyModifier.ctrl)).toBe(true);
  expect(isKey(parseKey('\x1c'), '\\', keyModifier.ctrl)).toBe(true);
  expect(isKey(parseKey('\x1f'), '_', keyModifier.ctrl)).toBe(true);
  expect(isKey(parseKey(' '), ' ')).toBe(true);
});

it('parses legacy Alt keys as Alt plus the key', () => {
  expect(encoded('\x1ba', 1)).toBe('\x1b[97;3u');
  expect(encoded('\x1b[', 1)).toBe('\x1b[91;3u');
  expect(encoded('\x1bO', 1)).toBe('\x1b[111;4u');
  expect(encoded('\x1b😀', 1)).toBe('\x1b[128512;3u');
  expect(encoded('\x1b\x7f', 1)).toBe('\x1b[127;3u');
  expect(encoded('\x1b\x01', 1)).toBe('\x1b[97;7u');
  expect(encoded('\x1bx', 31)).toBe('\x1b[120;3;120u');
  expect(isKey(parseKey('\x1ba'), 'a', keyModifier.alt)).toBe(true);
  expect(isKey(parseKey('\x1b[A'), 'up')).toBe(true);
});

it('gives the key of a press without a text field', () => {
  expect(keyText(parseKey('\x1b[97u'))).toBe('a');
  expect(keyText(parseKey('\x1b[97;2u'))).toBe('A');
  expect(keyText(parseKey('\x1b[44:60;2u'))).toBe('<');
  expect(keyText(parseKey('\x1b[44;2u'))).toBeUndefined();
  expect(keyText(parseKey('\x1b[97;3u'))).toBeUndefined();
  expect(keyText(parseKey('\x1b[13u'))).toBeUndefined();
  expect(keyText(parseKey('\x1b[A'))).toBeUndefined();
});

it('matches a key only with the same key and modifiers', () => {
  const ctrlB = parseKey('\x1b[98;5u');

  expect(isKey(ctrlB, 'a', keyModifier.ctrl)).toBe(false);
  expect(isKey(ctrlB, 'b', keyModifier.alt)).toBe(false);
  expect(isKey(ctrlB, 'b')).toBe(false);
  expect(isKey(parseKey('\x1b[98u'), 'b', keyModifier.ctrl)).toBe(false);
});

it('sends Ctrl plus a symbol or digit as its control byte for flags 0', () => {
  const controls = new Map([
    ['\x1b[32;5u', '\x00'],
    ['\x1b[64;5u', '\x00'],
    ['\x1b[50;5u', '\x00'],
    ['\x1b[91;5u', '\x1b'],
    ['\x1b[51;5u', '\x1b'],
    ['\x1b[92;5u', '\x1c'],
    ['\x1b[52;5u', '\x1c'],
    ['\x1b[93;5u', '\x1d'],
    ['\x1b[53;5u', '\x1d'],
    ['\x1b[94;5u', '\x1e'],
    ['\x1b[54;5u', '\x1e'],
    ['\x1b[95;5u', '\x1f'],
    ['\x1b[47;5u', '\x1f'],
    ['\x1b[55;5u', '\x1f'],
    ['\x1b[45;5u', '\x1f'],
    ['\x1b[49;5u', '1'],
    ['\x1b[33;5u', '!'],
    ['\x1b[65;5u', '\x01'],
  ]);

  for (const [raw, bytes] of controls) {
    expect(encoded(raw, 0)).toBe(bytes);
  }
});

it('changes only plain CSI cursor keys in application cursor mode', () => {
  expect(encoded('\x1ba', 0, true)).toBe('\x1ba');
  expect(encoded('\x1b[', 0, true)).toBe('\x1b[');
  expect(encoded('\x1b[1;5A', 0, true)).toBe('\x1b[1;5A');
  expect(encoded('\x1b[A', 0, true)).toBe('\x1bOA');
  expect(encoded('\x1b[F', 0, true)).toBe('\x1bOF');
  expect(encoded('\x1b[3~', 0, true)).toBe('\x1b[3~');
  expect(encoded('\x1b[A', 31, true)).toBe('\x1b[A');
});

it('sends kitty-form keys to a legacy pane with SS3 where legacy does', () => {
  expect(encoded('\x1b[1;1:2P', 0)).toBe('\x1bOP');
  expect(encoded('\x1b[1;1:2Q', 0)).toBe('\x1bOQ');
  expect(encoded('\x1b[13;1:2~', 0)).toBe('\x1bOR');
  expect(encoded('\x1b[1;1:2A', 0)).toBe('\x1b[A');
  expect(encoded('\x1b[1;1:2A', 0, true)).toBe('\x1bOA');
  expect(encoded('\x1b[1;1:2F', 0, true)).toBe('\x1bOF');
  expect(encoded('\x1b[1;1:2H', 0, true)).toBe('\x1bOH');
  expect(encoded('\x1b[1;1:2P', 0, true)).toBe('\x1bOP');
  expect(encoded('\x1bOA', 0)).toBe('\x1bOA');
  expect(encoded('\x1bOA', 0, true)).toBe('\x1bOA');
});

it('keeps the shifted key a terminal reports in the alternate-key field', () => {
  expect(encoded('\x1b[44:60;2u', 4 | 8)).toBe('\x1b[44:60;2u');
  expect(encoded('\x1b[44;2u', 4 | 8)).toBe('\x1b[44;2u');
  expect(encoded('\x1b[97:65;2u', 4 | 8)).toBe('\x1b[97:65;2u');
});

it('sends Shift+Tab and Shift with editing keys as escapes under flag 1', () => {
  expect(encoded('\x1b[Z', 1)).toBe('\x1b[9;2u');
  expect(encoded('\x1b[Z', 0)).toBe('\x1b[Z');
  expect(encoded('\x1b[13;2u', 1)).toBe('\x1b[13;2u');
  expect(encoded('\x1b[127;2u', 1)).toBe('\x1b[127;2u');
  expect(parseKey('\x1b[Z')).toMatchObject({ key: 'tab', modifiers: keyModifier.shift });
});

it('reports the release of a modified editing key', () => {
  expect(encoded('\x1b[13;5:3u', 2)).toBe('\x1b[13;5:3u');
  expect(encoded('\x1b[127;2:3u', 2)).toBe('\x1b[127;2:3u');
  expect(encoded('\x1b[13;1:3u', 2)).toBe('');
});
