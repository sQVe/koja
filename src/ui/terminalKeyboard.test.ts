import { expect, it } from 'bun:test';

import { createTerminalKeyboard } from './terminalKeyboard.ts';

const setup = () => {
  const written: string[] = [];
  const keyboard = createTerminalKeyboard((text) => written.push(text));

  return { keyboard, written };
};

it('asks for flags 7 and raises to 31 while the pane wants all keys as escape codes', () => {
  const { keyboard, written } = setup();

  keyboard.follow(0);
  keyboard.follow(1);
  keyboard.follow(31);
  keyboard.follow(8);
  keyboard.follow(3);

  expect(written).toEqual(['\x1b[>7u', '\x1b[<u\x1b[>31u', '\x1b[<u\x1b[>7u']);
});

it('pops what it pushed on restore, once, and nothing before it asked', () => {
  const { keyboard, written } = setup();

  keyboard.restore();
  keyboard.follow(0);
  keyboard.restore();
  keyboard.restore();

  expect(written).toEqual(['\x1b[>7u', '\x1b[<u']);
});
