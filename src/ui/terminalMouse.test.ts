import { expect, it } from 'bun:test';

import { createTerminalMouse } from './terminalMouse.ts';

it('turns the outer mouse reporting on once and off once after it was on', () => {
  const written: string[] = [];
  const mouse = createTerminalMouse((text) => written.push(text));

  mouse.restore();
  mouse.enable();
  mouse.enable();
  mouse.restore();
  mouse.restore();

  expect(written).toEqual([
    '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h',
    '\x1b[?1006l\x1b[?1016l\x1b[?1015l\x1b[?1005l\x1b[?1003l\x1b[?1002l\x1b[?1000l',
  ]);
});
