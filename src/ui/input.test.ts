import { expect, it } from 'bun:test';

import type { InputMode } from '../client/client.ts';
import { ModeFlag } from '../rows/rows.ts';
import { routeKey, routePaste } from './input.ts';
import type { ScrollMotion } from './scrollMotions.ts';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const key = (raw: string, mode: InputMode, modes = 0) => {
  const routed = routeKey(raw, mode, modes);

  return { text: decoder.decode(routed.bytes), mode: routed.mode };
};

const paste = (text: string, modes = 0) => decoder.decode(routePaste(encoder.encode(text), modes));

it('sends a cursor key as an application key in insert mode when the pane asks for it', () => {
  expect(key('\x1b[A', 'insert', ModeFlag.applicationCursorKeys)).toEqual({
    text: '\x1bOA',
    mode: 'insert',
  });
});

it('keeps a cursor key as it is when the pane does not ask for application keys', () => {
  for (const tail of ['A', 'B', 'C', 'D', 'H', 'F']) {
    expect(key(`\x1b[${tail}`, 'insert')).toEqual({
      text: `\x1b[${tail}`,
      mode: 'insert',
    });
  }
});

it('changes every cursor key in application cursor mode', () => {
  for (const tail of ['A', 'B', 'C', 'D', 'H', 'F']) {
    expect(key(`\x1b[${tail}`, 'insert', ModeFlag.applicationCursorKeys).text).toBe(`\x1bO${tail}`);
  }
});

it('keeps a key with a modifier as it is in application cursor mode', () => {
  expect(key('\x1b[1;5A', 'insert', ModeFlag.applicationCursorKeys).text).toBe('\x1b[1;5A');
});

it('sends keys, Ctrl+C, and Escape raw in insert mode', () => {
  expect(key('a', 'insert')).toEqual({ text: 'a', mode: 'insert' });
  expect(key('\x03', 'insert')).toEqual({ text: '\x03', mode: 'insert' });
  expect(key('\x1b', 'insert')).toEqual({ text: '\x1b', mode: 'insert' });
});

it('enters normal mode on Ctrl+B and sends nothing', () => {
  expect(key('\x02', 'insert')).toEqual({ text: '', mode: 'normal' });
});

it('sends one literal Ctrl+B when it is pressed twice from insert mode', () => {
  const first = key('\x02', 'insert');
  const second = key('\x02', first.mode);

  expect(first.text + second.text).toBe('\x02');
  expect(second.mode).toBe('insert');
});

it('returns to insert mode on i or Escape without sending anything', () => {
  expect(key('i', 'normal')).toEqual({ text: '', mode: 'insert' });
  expect(key('\x1b', 'normal')).toEqual({ text: '', mode: 'insert' });
});

it('asks to detach on d in normal mode, sends nothing, and returns to insert mode', () => {
  expect(routeKey('d', 'normal', 0)).toEqual({
    bytes: new Uint8Array(),
    mode: 'insert',
    effect: { kind: 'detach' },
  });
});

it('does not ask to detach for d in insert mode or other keys in normal mode', () => {
  expect(routeKey('d', 'insert', 0).effect).toBeUndefined();
  expect(routeKey('i', 'normal', 0).effect).toBeUndefined();
});

it('enters scroll mode on [ in normal mode and returns to insert mode on q', () => {
  const entered = routeKey('[', 'normal', 0);

  expect(entered).toEqual({
    bytes: new Uint8Array(),
    mode: 'scroll',
    effect: { kind: 'scrollEnter' },
  });

  expect(routeKey('q', 'scroll', 0)).toEqual({
    bytes: new Uint8Array(),
    mode: 'insert',
    effect: { kind: 'scroll', action: { kind: 'leave' } },
  });
});

it('leaves scroll mode on Escape and sends nothing', () => {
  expect(routeKey('\x1b', 'scroll', 0)).toMatchObject({
    bytes: new Uint8Array(),
    mode: 'insert',
    effect: { kind: 'scroll', action: { kind: 'leave' } },
  });

  expect(routeKey('\x1b[27u', 'scroll', 0)).toMatchObject({
    mode: 'insert',
    effect: { kind: 'scroll', action: { kind: 'leave' } },
  });
});

it('treats Ctrl+B in scroll mode as the prefix, which leaves scroll mode', () => {
  for (const raw of ['\x02', '\x1b[98;5u']) {
    expect(routeKey(raw, 'scroll', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'normal',
      effect: { kind: 'scroll', action: { kind: 'leave' } },
    });
  }
});

const scrollKeys: [string, ScrollMotion][] = [
  ['h', 'left'],
  ['j', 'down'],
  ['k', 'up'],
  ['l', 'right'],
  ['\x1b[D', 'left'],
  ['\x1b[B', 'down'],
  ['\x1b[A', 'up'],
  ['\x1b[C', 'right'],
  ['w', 'wordStart'],
  ['b', 'wordStartPrevious'],
  ['e', 'wordEnd'],
  ['W', 'bigWordStart'],
  ['B', 'bigWordStartPrevious'],
  ['E', 'bigWordEnd'],
  ['0', 'lineStart'],
  ['\x1b[H', 'lineStart'],
  ['^', 'firstNonBlank'],
  ['$', 'lineEnd'],
  ['\x1b[F', 'lineEnd'],
  ['{', 'paragraphPrevious'],
  ['}', 'paragraphNext'],
  ['\x1b[5~', 'pageUp'],
  ['\x1b[6~', 'pageDown'],
  ['\x15', 'halfPageUp'],
  ['\x04', 'halfPageDown'],
  ['\x06', 'pageDown'],
  ['g', 'historyTop'],
  ['G', 'historyBottom'],
];

for (const [raw, motion] of scrollKeys) {
  it(`moves ${motion} on ${JSON.stringify(raw)} in scroll mode, sending nothing to the pane`, () => {
    expect(routeKey(raw, 'scroll', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'scroll',
      effect: { kind: 'scroll', action: { kind: 'move', motion } },
    });
  });
}

it('ignores other keys, Alt keys, and releases in scroll mode', () => {
  for (const raw of ['a', 'i', 'd', 'x', '\x1bh', '\x1b[104;1:3u', '\x1b[66;1:3u', '\x1b[1;3A']) {
    expect(routeKey(raw, 'scroll', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'scroll',
      effect: undefined,
    });
  }
});

it('sends nothing for other keys in normal mode', () => {
  expect(key('a', 'normal')).toEqual({ text: '', mode: 'normal' });

  expect(key('\x1b[A', 'normal', ModeFlag.applicationCursorKeys)).toEqual({
    text: '',
    mode: 'normal',
  });
});

it('sends pasted bytes unchanged when the pane has no bracketed paste', () => {
  expect(paste('a\r\n\x1b[200~b')).toBe('a\r\n\x1b[200~b');
});

it('wraps pasted bytes in markers when the pane has bracketed paste', () => {
  expect(paste('one\ntwo', ModeFlag.bracketedPaste)).toBe('\x1b[200~one\ntwo\x1b[201~');
});

it('sends a paste in normal mode and keeps the mode', () => {
  const normal = routeKey('\x02', 'insert', 0).mode;

  expect(normal).toBe('normal');
  expect(paste('abc', ModeFlag.bracketedPaste)).toBe('\x1b[200~abc\x1b[201~');
  expect(paste('abc')).toBe('abc');
  expect(key('a', normal).mode).toBe('normal');
});

it('routes t to a new tab and sends nothing to the pane', () => {
  expect(routeKey('t', 'normal', 0)).toEqual({
    bytes: new Uint8Array(),
    mode: 'normal',
    effect: { kind: 'tab', route: { kind: 'create' } },
  });
});

it('routes H and L to the previous and next tab', () => {
  expect(routeKey('H', 'normal', 0).effect).toEqual({
    kind: 'tab',
    route: { kind: 'previous' },
  });

  expect(routeKey('L', 'normal', 0).effect).toEqual({
    kind: 'tab',
    route: { kind: 'next' },
  });

  expect(routeKey('L', 'normal', 0).bytes).toEqual(new Uint8Array());
});

it('routes 1 to 9 to a tab by number and leaves 0 alone', () => {
  for (let number = 1; number <= 9; number += 1) {
    const routed = routeKey(String(number), 'normal', 0);

    expect(routed.effect).toEqual({
      kind: 'tab',
      route: { kind: 'number', number },
    });

    expect(routed.bytes).toEqual(new Uint8Array());
  }

  expect(routeKey('0', 'normal', 0).effect).toBeUndefined();
});

it('sends t, H, L, and digits to the pane in insert mode', () => {
  for (const raw of ['t', 'H', 'L', '3']) {
    expect(routeKey(raw, 'insert', 0)).toEqual({
      bytes: encoder.encode(raw),
      mode: 'insert',
      effect: undefined,
    });
  }
});

const withKittyFlags = (flags: number, modes = 0) => modes | (flags << 9);

it('enters normal mode on kitty Ctrl+B and sends nothing, whatever flags the pane asked for', () => {
  for (const flags of [0, 1, 31]) {
    expect(key('\x1b[98;5u', 'insert', withKittyFlags(flags))).toEqual({
      text: '',
      mode: 'normal',
    });
  }
});

it('reads normal-mode keys from kitty input', () => {
  const modes = withKittyFlags(31);

  expect(routeKey('\x1b[105u', 'normal', modes).mode).toBe('insert');
  expect(routeKey('\x1b[27u', 'normal', modes).mode).toBe('insert');

  expect(routeKey('\x1b[100u', 'normal', modes).effect).toEqual({
    kind: 'detach',
  });

  expect(routeKey('\x1b[104;2:1;72u', 'normal', modes).effect).toEqual({
    kind: 'tab',
    route: { kind: 'previous' },
  });

  expect(routeKey('\x1b[104;5u', 'normal', modes).effect).toBeUndefined();

  expect(routeKey('\x1b[108;2;76u', 'normal', modes).effect).toEqual({
    kind: 'tab',
    route: { kind: 'next' },
  });

  expect(routeKey('\x1b[115u', 'normal', modes).effect).toEqual({
    kind: 'pane',
    action: 'splitBelow',
  });
});

it('ignores a kitty release in normal mode', () => {
  const routed = routeKey('\x1b[100;1:3u', 'normal', withKittyFlags(3));

  expect(routed).toEqual({
    bytes: new Uint8Array(),
    mode: 'normal',
    effect: undefined,
  });
});

it('sends a kitty release to a pane with event types, and not to one without', () => {
  expect(key('\x1b[97;1:3u', 'insert', withKittyFlags(3))).toEqual({
    text: '\x1b[97;1:3u',
    mode: 'insert',
  });

  expect(key('\x1b[97;1:3u', 'insert', withKittyFlags(1)).text).toBe('');
});

it('sends a literal kitty Ctrl+B in the pane encoding after Ctrl+B Ctrl+B', () => {
  const modes = withKittyFlags(1);
  const first = key('\x1b[98;5u', 'insert', modes);
  const second = key('\x1b[98;5u', first.mode, modes);

  expect(second).toEqual({ text: '\x1b[98;5u', mode: 'insert' });
});

it('ignores Alt keys in normal mode, in legacy and kitty form', () => {
  const ignored = {
    bytes: new Uint8Array(),
    mode: 'normal' as const,
    effect: undefined,
  };

  for (const raw of [
    '\x1bx',
    '\x1bd',
    '\x1bX',
    '\x1bi',
    '\x1b[120;3u',
    '\x1b[100;3u',
    '\x1b[120;4u',
  ]) {
    expect(routeKey(raw, 'normal', 0)).toEqual(ignored);
    expect(routeKey(raw, 'normal', 31 << 9)).toEqual(ignored);
  }
});

it('still sends an Alt key to the pane in insert mode', () => {
  expect(key('\x1bx', 'insert')).toEqual({ text: '\x1bx', mode: 'insert' });
});

it('asks to detach only for d', () => {
  const taken = [
    routeKey('\x02', 'normal', 0),
    routeKey('\x1b[98;5u', 'normal', 0),
    routeKey('j', 'normal', 0),
    routeKey('c', 'normal', 0),
    routeKey('t', 'normal', 0),
    routeKey('s', 'normal', 0),
    routeKey('[', 'normal', 0),
    routeKey('x', 'normal', 0),
    routeKey('\x1b[98;5:2u', 'insert', 0),
    routeKey('\x1b[98;5:2u', 'normal', 0),
  ];

  expect(taken.map((routed) => routed.effect?.kind === 'detach')).toEqual(taken.map(() => false));
});

it('ignores the release of a scroll key', () => {
  for (const raw of ['\x1b[1;1:3A', '\x1b[27;1:3u', '\x1b[113;1:3u']) {
    expect(routeKey(raw, 'scroll', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'scroll',
      effect: undefined,
    });
  }

  expect(routeKey('\x1b[1;1:1A', 'scroll', 0).effect).toEqual({
    kind: 'scroll',
    action: { kind: 'move', motion: 'up' },
  });
});

it('stays in scroll mode on q with Alt or Ctrl', () => {
  for (const raw of ['\x1b[113;3;113u', '\x1b[113;5;113u', '\x1b[113;9;113u']) {
    const routed = routeKey(raw, 'scroll', 0);

    expect(routed.mode).toBe('scroll');
    expect(routed.effect).toBeUndefined();
  }
});

it('asks for no tab when the key text is more than one digit', () => {
  expect(routeKey('\x1b[49;1;49:50u', 'normal', 0).effect).toBeUndefined();

  expect(routeKey('\x1b[49;1;49u', 'normal', 0).effect).toEqual({
    kind: 'tab',
    route: { kind: 'number', number: 1 },
  });
});

it('asks for no workspace when the key text names a built-in object property', () => {
  for (const text of ['constructor', 'toString', '__proto__']) {
    const codePoints = Array.from(text, (character) => character.codePointAt(0)).join(':');

    expect(routeKey(`\x1b[99;1;${codePoints}u`, 'normal', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'normal',
      effect: undefined,
    });
  }
});
