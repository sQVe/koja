import { ModeFlag } from '../rows/rows.ts';

type MouseKind = 'press' | 'release' | 'drag' | 'motion' | 'wheel';

export interface MouseEvent {
  kind: MouseKind;
  // 0 left, 1 middle, 2 right for buttons. 64 up, 65 down, 66 left, 67 right for the wheel.
  button: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  // 0-based cell coordinates in the outer terminal.
  x: number;
  y: number;
}

const reportPrefix = '\x1b[<';
const sgrReport = /^([0-9]+);([0-9]+);([0-9]+)([Mm])$/;
const escapeByte = 0x1b;
const leftBracketByte = 0x5b;
const upperMByte = 0x4d;

const shiftBit = 4;
const altBit = 8;
const ctrlBit = 16;
const motionBit = 32;
const wheelBit = 64;
const buttonMask = 3;
const noButton = 3;
const legacyOffset = 32;
const legacyMax = 255;

const hasBit = (value: number, bit: number): boolean => (value & bit) !== 0;

const kindOf = (code: number, final: string): MouseKind => {
  if (hasBit(code, wheelBit)) {
    return 'wheel';
  }

  if (hasBit(code, motionBit)) {
    return (code & buttonMask) === noButton ? 'motion' : 'drag';
  }

  return final === 'm' ? 'release' : 'press';
};

export const parseMouse = (raw: string): MouseEvent | undefined => {
  const match = raw.startsWith(reportPrefix)
    ? sgrReport.exec(raw.slice(reportPrefix.length))
    : null;

  if (match === null) {
    return undefined;
  }

  const code = Number(match[1]);
  const column = Number(match[2]);
  const row = Number(match[3]);
  const kind = kindOf(code, match[4] ?? 'M');
  const button = code & (wheelBit | buttonMask);

  if (column < 1 || row < 1) {
    return undefined;
  }

  return {
    kind,
    button,
    shift: hasBit(code, shiftBit),
    alt: hasBit(code, altBit),
    ctrl: hasBit(code, ctrlBit),
    x: column - 1,
    y: row - 1,
  };
};

const trackingModes = ModeFlag.normalMouse | ModeFlag.buttonMouse | ModeFlag.anyMouse;

// Mode 9 alone reports only left, middle, and right presses, without modifiers. Modes 1000,
// 1002, and 1003 take over when set with it.
const isX10Only = (modes: number): boolean =>
  (modes & ModeFlag.x10Mouse) !== 0 && (modes & trackingModes) === 0;

const wantsEvent = (event: MouseEvent, modes: number): boolean => {
  const { kind } = event;

  if (isX10Only(modes)) {
    // Stryker disable next-line ConditionalExpression: The SGR press bits make the button check redundant.
    return kind === 'press' && event.button <= 2;
  }

  if ((modes & trackingModes) === 0) {
    return false;
  }

  if (kind === 'drag') {
    return (modes & (ModeFlag.buttonMouse | ModeFlag.anyMouse)) !== 0;
  }

  return kind === 'motion' ? (modes & ModeFlag.anyMouse) !== 0 : true;
};

const baseCode = (event: MouseEvent): number => {
  if (event.kind === 'drag') {
    return motionBit + event.button;
  }

  return event.kind === 'motion' ? motionBit + noButton : event.button;
};

const buildCode = (event: MouseEvent, sgr: boolean, modifiers: boolean): number => {
  const base = event.kind === 'release' && !sgr ? noButton : baseCode(event);

  if (!modifiers) {
    return base;
  }

  const shift = event.shift ? shiftBit : 0;
  const alt = event.alt ? altBit : 0;
  const ctrl = event.ctrl ? ctrlBit : 0;

  return base + shift + alt + ctrl;
};

// Encodes the event for a pane at 0-based pane cell (column, row), or returns no bytes when the
// pane's mouse modes do not want it.
export const encodeMouse = (
  event: MouseEvent,
  modes: number,
  column: number,
  row: number,
): Uint8Array => {
  if (!wantsEvent(event, modes)) {
    return new Uint8Array();
  }

  const sgr = (modes & ModeFlag.sgrMouse) !== 0;
  const code = buildCode(event, sgr, !isX10Only(modes));

  if (sgr) {
    const final = event.kind === 'release' ? 'm' : 'M';

    return new TextEncoder().encode(`\x1b[<${code};${column + 1};${row + 1}${final}`);
  }

  const values = [code + legacyOffset, column + 1 + legacyOffset, row + 1 + legacyOffset];

  if (values.some((value) => value > legacyMax)) {
    return new Uint8Array();
  }

  return Uint8Array.from([escapeByte, leftBracketByte, upperMByte, ...values]);
};
