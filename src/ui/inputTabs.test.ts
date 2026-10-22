import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { createInputHarness, decoder } from './inputFixtures.ts';

it('asks the host for a tab and keeps normal mode', () => {
  const { press, tabs, modeChanges } = createInputHarness('normal');

  press('2');

  expect(tabs).toEqual([{ kind: 'number', number: 2 }]);
  expect(modeChanges).toEqual(['normal']);
});

it('holds input while a tab request is unanswered and routes it in order after the answer', () => {
  const events: string[] = [];
  let pending = false;
  let answered: (() => void) | undefined;

  const { press } = createInputHarness('insert', {
    send: (bytes) => {
      if (bytes.length > 0) {
        events.push(`send ${decoder.decode(bytes)}`);
      }
    },
    tab: () => {
      pending = true;
      events.push('tab');
    },
    tabPending: () => pending,
    afterTabAnswer: (callback) => {
      answered = callback;
    },
  });

  for (const raw of ['\x02', 'L', 'i', 'a', '\x02', 'L', 'i', 'b']) {
    press(raw);
  }

  expect(events).toEqual(['tab']);

  pending = false;
  answered?.();

  expect(events).toEqual(['tab', 'send a', 'tab']);

  pending = false;
  answered?.();

  expect(events).toEqual(['tab', 'send a', 'tab', 'send b']);
});

it('holds a mouse token behind a pending tab request until the answer arrives', () => {
  const { toPane, mouse, startTab, answerTab } = createInputHarness('insert');

  startTab();
  mouse(0, 6, 3, 'M');

  expect(toPane).toEqual([]);

  answerTab();

  expect(toPane).toEqual([{ pane: paneId(1), text: '\x1b[<0;6;3M' }]);
});

it('focuses a tab by number on a left press over its label', () => {
  const { commands, tabs, focused, mouse } = createInputHarness('insert');

  mouse(0, 66, 3, 'M');
  mouse(0, 66, 3, 'm');

  expect(tabs).toEqual([{ kind: 'number', number: 2 }]);
  expect(commands).toEqual([]);
  expect(focused).toEqual([]);
});

it('wakes held tokens once after a tab answer', () => {
  const { press, startTab, answerTab, actions } = createInputHarness('normal');

  startTab();
  press('s');
  press('v');
  answerTab();

  expect(actions).toEqual(['splitBelow']);
});
