import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, drawn, drawnIcons, drawnTexts, elementsWithStyle } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import type { Ask } from './askFacts.ts';
import type { CardActions } from './view.ts';

const palette = {
  blocked: '#a81e26',
  border: '#b6bbc4',
  dim: '#43464e',
  foreground: '#1e2028',
  muted: '#383b43',
  popover: '#e6e8eb',
} as const;

Object.assign(globalThis, { kojaModName: 'koja-asks' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ settings: () => ({}), theme: () => palette }));

const kitParts = [
  'button',
  'icon',
  'overlay/card',
  'overlay/lines',
  'size',
  'text',
  'textRole',
  'theme',
  'terminalFont',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './view.ts';

const { cardElement } = (await import(modulePath)) as {
  cardElement: (
    ask: Ask,
    more: { count: number; space: string } | null,
    actions: CardActions,
  ) => DrawnElement;
};

const ask: Ask = {
  identity: 't1:permission:bun run sandbox up',
  address: 't1',
  spaceId: 's1',
  spaceName: 'Build window shell',
  tabId: 'k1',
  paneId: 'p1',
  agent: 'Claude Code',
  kind: 'permission',
  question: 'Allow this command?',
  command: 'bun run sandbox up',
  seq: 1,
};

const questionAsk: Ask = {
  ...ask,
  identity: 't1:question:Which judge model?',
  kind: 'question',
  question: 'Which judge model?',
  command: null,
};

let calls: string[] = [];

const actions: CardActions = {
  goToAsk: () => {
    calls.push('go');
  },
  dismiss: () => {
    calls.push('dismiss');
  },
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  calls = [];
});

describe('cardElement', () => {
  test('draws the space, the agent, the question, and the command', () => {
    const card = cardElement(ask, null, actions);

    expect(drawnTexts(card)).toEqual([
      'Build window shell',
      'Claude Code',
      'Allow this command?',
      'bun run sandbox up',
    ]);

    expect(drawnIcons(card)).toEqual(['message-circle-question.svg', 'x.svg']);
  });

  test('draws a question ask without a command line', () => {
    const card = cardElement(questionAsk, null, actions);

    expect(drawnTexts(card)).toEqual(['Build window shell', 'Claude Code', 'Which judge model?']);
  });

  test('draws one more line naming the next ask space', () => {
    const without = drawnTexts(cardElement(ask, null, actions));
    const withMore = drawnTexts(cardElement(ask, { count: 2, space: 'Hill-climb' }, actions));

    expect(withMore).toEqual([...without, '2 more asks in Hill-climb']);
  });

  test('a click on the card goes to the ask', () => {
    const card = cardElement(ask, null, actions);

    const clickable = elementsWithStyle(card, 'cursor_pointer')[0];

    expect(clickable).toBeDefined();

    if (clickable !== undefined) {
      click(clickable);
    }

    expect(calls).toEqual(['go']);
  });

  test('the dismiss control marks the ask dismissed without going to it', () => {
    const card = cardElement(ask, null, actions);

    const dismiss = elementsWithStyle(card, 'id').find(
      (part) => part.styles['id']?.[0] === 'koja-ask-dismiss',
    );

    expect(dismiss).toBeDefined();

    let stopped = 0;

    if (dismiss !== undefined) {
      click(dismiss, {
        stop_propagation: () => {
          stopped += 1;
        },
      });
    }

    expect(stopped).toBe(1);
    expect(calls).toEqual(['dismiss']);
  });
});
