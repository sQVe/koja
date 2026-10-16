import { expect, it } from 'bun:test';

import { ModeFlag } from '../rows/rows.ts';
import { encodeMouse, parseMouse } from './mouseEncoding.ts';
import type { MouseEvent } from './mouseEncoding.ts';

const text = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

const parsed = (raw: string): MouseEvent => {
  const event = parseMouse(raw);

  if (event === undefined) {
    throw new Error(`not a mouse report: ${raw}`);
  }

  return event;
};

const encode = (raw: string, modes: number, column = 4, row = 2): string =>
  text(encodeMouse(parsed(raw), modes, column, row));

const sgr = ModeFlag.normalMouse | ModeFlag.sgrMouse;
const x10Sgr = ModeFlag.x10Mouse | ModeFlag.sgrMouse;
const x10Normal = ModeFlag.x10Mouse | ModeFlag.normalMouse | ModeFlag.sgrMouse;
const x10Button = ModeFlag.x10Mouse | ModeFlag.buttonMouse | ModeFlag.sgrMouse;

it('encodes a left press at pane cell (4, 2) in SGR and legacy form', () => {
  expect(encode('\x1b[<0;10;10M', sgr)).toBe('\x1b[<0;5;3M');
  expect(encode('\x1b[<0;10;10M', ModeFlag.normalMouse)).toBe('\x1b[M %#');
});

it('encodes a release with the button in SGR and as button 3 in legacy form', () => {
  expect(encode('\x1b[<0;10;10m', sgr, 11, 9)).toBe('\x1b[<0;12;10m');
  expect(encode('\x1b[<0;10;10m', ModeFlag.normalMouse)).toBe('\x1b[M#%#');
});

it('encodes drags only with mode 1002 or 1003', () => {
  const drag = '\x1b[<32;3;3M';

  expect(encode(drag, ModeFlag.normalMouse)).toBe('');
  expect(encode(drag, ModeFlag.buttonMouse | ModeFlag.sgrMouse)).toBe('\x1b[<32;5;3M');
  expect(encode(drag, ModeFlag.anyMouse | ModeFlag.sgrMouse)).toBe('\x1b[<32;5;3M');
});

it('encodes plain motion only with mode 1003', () => {
  const motion = '\x1b[<35;3;3M';

  expect(encode(motion, ModeFlag.normalMouse)).toBe('');
  expect(encode(motion, ModeFlag.buttonMouse)).toBe('');
  expect(encode(motion, ModeFlag.anyMouse | ModeFlag.sgrMouse)).toBe('\x1b[<35;5;3M');
});

it('encodes the wheel as buttons 64 and 65 under any mouse mode', () => {
  for (const mode of [ModeFlag.normalMouse, ModeFlag.buttonMouse, ModeFlag.anyMouse]) {
    expect(encode('\x1b[<64;1;1M', mode + ModeFlag.sgrMouse)).toBe('\x1b[<64;5;3M');
    expect(encode('\x1b[<65;1;1M', mode + ModeFlag.sgrMouse)).toBe('\x1b[<65;5;3M');
  }
});

it('adds modifier bits to the button', () => {
  expect(encode('\x1b[<69;1;1M', sgr, 4, 6)).toBe('\x1b[<69;5;7M');
});

it('gives no bytes without a mouse mode', () => {
  for (const raw of [
    '\x1b[<0;1;1M',
    '\x1b[<0;1;1m',
    '\x1b[<32;1;1M',
    '\x1b[<35;1;1M',
    '\x1b[<64;1;1M',
  ]) {
    expect(encode(raw, ModeFlag.sgrMouse)).toBe('');
    expect(encode(raw, 0)).toBe('');
  }
});

it('gives no bytes in legacy form when a coordinate does not fit', () => {
  expect(encode('\x1b[<0;1;1M', ModeFlag.normalMouse, 223, 0)).toBe('');
  expect(encode('\x1b[<0;1;1M', ModeFlag.normalMouse, 222, 0)).toBe('\x1b[M \xff!');
});

it('parses the button, modifiers, and 0-based cell of a report', () => {
  expect(parsed('\x1b[<2;7;9M')).toEqual({
    kind: 'press',
    button: 2,
    shift: false,
    alt: false,
    ctrl: false,
    x: 6,
    y: 8,
  });

  expect(parsed('\x1b[<28;1;1m')).toMatchObject({
    kind: 'release',
    shift: true,
    alt: true,
    ctrl: true,
  });

  expect(parsed('\x1b[<33;1;1M')).toMatchObject({ kind: 'drag', button: 1 });
  expect(parsed('\x1b[<35;1;1M').kind).toBe('motion');
  expect(parsed('\x1b[<65;1;1M')).toMatchObject({ kind: 'wheel', button: 65 });
});

it('rejects text that is not an SGR mouse report', () => {
  expect(parseMouse('\x1b[A')).toBeUndefined();
  expect(parseMouse('\x1b[<0;0;1M')).toBeUndefined();
});

it('encodes only left, middle, and right presses under mode 9', () => {
  expect(encode('\x1b[<0;10;10M', ModeFlag.x10Mouse)).toBe('\x1b[M %#');
  expect(encode('\x1b[<1;10;10M', ModeFlag.x10Mouse)).toBe('\x1b[M!%#');
  expect(encode('\x1b[<2;10;10M', x10Sgr)).toBe('\x1b[<2;5;3M');
  expect(encode('\x1b[<0;10;10m', ModeFlag.x10Mouse)).toBe('');
  expect(encode('\x1b[<0;10;10m', x10Sgr)).toBe('');
  expect(encode('\x1b[<32;10;10M', ModeFlag.x10Mouse)).toBe('');
  expect(encode('\x1b[<35;10;10M', ModeFlag.x10Mouse)).toBe('');
  expect(encode('\x1b[<64;10;10M', ModeFlag.x10Mouse)).toBe('');
  expect(encode('\x1b[<65;10;10M', x10Sgr)).toBe('');
});

it('drops modifier bits under mode 9', () => {
  const shiftAltCtrl = '\x1b[<28;10;10M';

  expect(encode(shiftAltCtrl, ModeFlag.x10Mouse)).toBe('\x1b[M %#');
  expect(encode(shiftAltCtrl, x10Sgr)).toBe('\x1b[<0;5;3M');
  expect(encode(shiftAltCtrl, ModeFlag.normalMouse | ModeFlag.sgrMouse)).toBe('\x1b[<28;5;3M');
});

it('lets modes 1000, 1002, and 1003 win over mode 9', () => {
  const release = '\x1b[<0;10;10m';

  expect(encode(release, x10Normal)).toBe('\x1b[<0;5;3m');
  expect(encode('\x1b[<64;1;1M', x10Normal)).toBe('\x1b[<64;5;3M');
  expect(encode('\x1b[<32;1;1M', x10Button)).toBe('\x1b[<32;5;3M');
});

it('rejects a report with row 0', () => {
  expect(parseMouse('\x1b[<0;1;0M')).toBeUndefined();
});

it('encodes a drag with the middle or right button', () => {
  expect(encode('\x1b[<33;3;3M', ModeFlag.buttonMouse | ModeFlag.sgrMouse)).toBe('\x1b[<33;5;3M');
  expect(encode('\x1b[<34;3;3M', ModeFlag.buttonMouse | ModeFlag.sgrMouse)).toBe('\x1b[<34;5;3M');
});
