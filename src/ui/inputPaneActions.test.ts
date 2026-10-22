import { expect, it } from 'bun:test';

import { createInputHarness } from './inputFixtures.ts';
import type { PaneAction } from './paneActions.ts';

const paneKeys: [string, PaneAction][] = [
  ['s', 'splitBelow'],
  ['v', 'splitRight'],
  ['h', 'focusPrevious'],
  ['l', 'focusNext'],
  ['x', 'close'],
  ['z', 'zoom'],
  ['<', 'resizeLeft'],
  ['>', 'resizeRight'],
  ['-', 'resizeUp'],
  ['+', 'resizeDown'],
  ['!', 'breakPane'],
];

for (const [raw, action] of paneKeys) {
  it(`asks for ${action} on ${raw} in normal mode, sends no bytes, and stays in normal mode`, () => {
    const { press, sent, actions, mode } = createInputHarness('insert');

    press('\x02');
    press(raw);

    expect(actions).toEqual([action]);
    expect(sent).toEqual([]);
    expect(mode()).toBe('normal');
  });

  it(`sends ${raw} to the pane in insert mode without a pane action`, () => {
    const { press, sent, actions } = createInputHarness('insert');

    press(raw);

    expect(actions).toEqual([]);
    expect(sent).toEqual([raw]);
  });
}

it('holds the tokens after a pane action until its answer arrives, then sends them in order', async () => {
  const { press, sent, actions, answerPaneAction } = createInputHarness('insert');

  press('\x02');
  press('h');
  press('i');
  press('a');
  press('b');

  expect(actions).toEqual(['focusPrevious']);
  expect(sent).toEqual([]);

  await answerPaneAction();

  expect(sent).toEqual(['a', 'b']);
});

it('holds the tokens that follow a second pane action until that action is answered', async () => {
  const { press, sent, actions, answerPaneAction } = createInputHarness('insert');

  for (const raw of ['\x02', 'l', 's', 'i', 'z']) {
    press(raw);
  }

  await answerPaneAction();

  expect(actions).toEqual(['focusNext', 'splitBelow']);
  expect(sent).toEqual([]);

  await answerPaneAction();

  expect(sent).toEqual(['z']);
});

it('sends held tokens when the action fails to settle normally', async () => {
  const { press, sent } = createInputHarness('insert', {
    paneAction: () => Promise.reject(new Error('lost')),
  });

  press('\x02');
  press('x');
  press('i');
  press('q');
  await Promise.resolve();
  await Promise.resolve();

  expect(sent).toEqual(['q']);
});
