import { expect, it } from 'bun:test';

import { createInputHarness } from './inputFixtures.ts';

const withKittyFlags = (flags: number, modes = 0) => modes | (flags << 9);

it('detaches once when d follows Ctrl+B and not when d is typed in insert mode', () => {
  const { press, detaches } = createInputHarness('insert');

  press('d');

  expect(detaches()).toBe(0);

  press('\x02');
  press('d');

  expect(detaches()).toBe(1);
});

it('hands scroll actions to the host and returns to normal mode on Ctrl+B', () => {
  const { press, scrolls, sent, mode } = createInputHarness('normal');

  press('[');
  press('g');
  press('\x02');

  expect(scrolls).toEqual([
    { kind: 'enter' },
    { kind: 'move', motion: 'historyTop' },
    { kind: 'leave' },
  ]);

  expect(mode()).toBe('normal');

  press('\x02');

  expect(sent).toEqual(['\x02']);
  expect(mode()).toBe('insert');
});

it('leaves scroll mode for insert mode on q and sends nothing to the pane', () => {
  const { press, scrolls, sent, mode } = createInputHarness('normal');

  press('[');
  press('q');
  press('x');

  expect(scrolls).toEqual([{ kind: 'enter' }, { kind: 'leave' }]);
  expect(mode()).toBe('insert');
  expect(sent).toEqual(['x']);
});

it('gives the host no scroll action for keys that do not scroll', () => {
  const { press, scrolls } = createInputHarness('normal');

  press('j');
  press('i');
  press('a');

  expect(scrolls).toHaveLength(0);
});

it('keeps normal mode and sends nothing while Ctrl+B is held and released', () => {
  for (const flags of [0, 3, 31]) {
    const { press, sent, mode } = createInputHarness('insert', {}, withKittyFlags(flags));

    press('\x1b[98;5u');
    press('\x1b[98;5:2u');
    press('\x1b[98;5:2u');
    press('\x1b[98;5:3u');

    expect(mode()).toBe('normal');
    expect(sent).toEqual([]);
  }
});

it('does not send the release of a key that Koja took to the pane', () => {
  const { press, sent, mode } = createInputHarness('normal', {}, withKittyFlags(31));

  press('\x1b[105u');
  press('\x1b[105;1:3u');

  expect(mode()).toBe('insert');
  expect(sent).toEqual([]);
});

it('sends the release of a key to the pane when its press reached the pane', () => {
  const { press, sent } = createInputHarness('insert', {}, withKittyFlags(0b1011));

  press('\x1b[97;1:1u');
  press('\x1b[97;1:3u');

  expect(sent).toEqual(['\x1b[97u', '\x1b[97;1:3u']);
});

it('sends the release of a key to the pane after Koja took an earlier press of it', () => {
  const { press, sent, mode } = createInputHarness('normal', {}, withKittyFlags(0b1011));

  press('\x1b[105;1:1u');

  expect(mode()).toBe('insert');
  expect(sent).toEqual([]);

  press('\x1b[105;1:1u');
  press('\x1b[105;1:3u');

  expect(sent).toEqual(['\x1b[105u', '\x1b[105;1:3u']);
});
