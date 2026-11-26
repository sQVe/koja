import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  click,
  clickablesWithText,
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithText,
  elementsWithId,
  elementsWithStyle,
} from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import type { NeedsYouHint } from '../../kit/needsYou.ts';
import { needsYouHint } from '../../kit/needsYou.ts';
import type { Ask } from './askFacts.ts';
import type { AskRow } from './card.ts';
import type { CardActions } from './view.ts';

type HoverLook = (box: DrawnElement) => DrawnElement;

const palette = {
  blocked: '#a81e26',
  border: '#b6bbc4',
  dim: '#43464e',
  foreground: '#1e2028',
  hover: '#eef0f3',
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
  'keycap',
  'overlay/card',
  'overlay/lines',
  'size',
  'text',
  'textRole',
  'theme',
  'font',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './view.ts';

const { cardElement, listElement } = (await import(modulePath)) as {
  cardElement: (
    ask: Ask,
    more: { count: number; space: string } | null,
    hint: NeedsYouHint | null,
    actions: CardActions,
  ) => DrawnElement;
  listElement: (rows: readonly AskRow[], actions: CardActions) => DrawnElement;
};

const ask: Ask = {
  identity: 't1:permission:bun run sandbox up',
  address: 't1',
  spaceId: 's1',
  spaceName: 'Build window shell',
  project: 'koja',
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

const secondAsk: Ask = {
  identity: 't2:question:Which judge model for round 2?',
  address: 't2',
  spaceId: 's2',
  spaceName: 'Hill-climb mode for judges',
  project: 'tau',
  tabId: 'k3',
  paneId: 'p2',
  agent: 'Pi',
  kind: 'question',
  question: 'Which judge model for round 2?',
  command: null,
  seq: 2,
};

const rows: AskRow[] = [
  { ask, age: '2m' },
  { ask: secondAsk, age: '5m' },
];

// The drawn fake records the hover callback without running it, so run it on a fresh element.
const hoverFill = (part: DrawnElement): string[] => {
  const look = part.styles['hover']?.[0] as HoverLook | undefined;
  const box = drawn();

  if (look !== undefined) {
    look(box);
  }

  return box.backgroundColors;
};

let calls: string[] = [];

const actions: CardActions = {
  goToAsk: () => {
    calls.push('go');
  },
  dismiss: () => {
    calls.push('dismiss');
  },
  openList: () => {
    calls.push('open');
  },
  goToRow: (rowAsk) => {
    calls.push(`row:${rowAsk.address}`);
  },
  dismissList: () => {
    calls.push('dismissList');
  },
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  calls = [];
});

describe('listElement', () => {
  test('draws the count and every ask with its space, project, age, agent, question, and command', () => {
    const list = listElement(rows, actions);

    expect(drawnTexts(list)).toEqual([
      '2 asks in other spaces',
      'Build window shell',
      'koja · 2m',
      'Claude Code · Allow this command?',
      'bun run sandbox up',
      'Hill-climb mode for judges',
      'tau · 5m',
      'Pi · Which judge model for round 2?',
    ]);

    expect(drawnIcons(list)).toEqual([
      'x.svg',
      'message-circle-question.svg',
      'message-circle-question.svg',
    ]);
  });

  test('puts the rows in a scrolling body under the title', () => {
    const list = listElement(rows, actions);
    const body = elementsWithStyle(list, 'overflow_y_scrollbar')[0];

    expect(body).toBeDefined();

    if (body !== undefined) {
      expect(drawnTexts(body)).toContain('Build window shell');
      expect(drawnTexts(body)).not.toContain('2 asks in other spaces');
    }
  });

  test('a click on a row goes to that ask', () => {
    const list = listElement(rows, actions);

    const row = clickablesWithText(list, 'Hill-climb mode for judges').at(-1);

    if (row !== undefined) {
      click(row);
    }

    expect(calls).toEqual(['row:t2']);
  });

  test('a row fills on hover and is clickable', () => {
    const list = listElement(rows, actions);
    const clickable = new Set(elementsWithStyle(list, 'cursor_pointer'));

    const rowsWithHover = elementsWithStyle(list, 'hover').filter((part) => clickable.has(part));
    const fills = rowsWithHover.map((part) => hoverFill(part));

    expect(rowsWithHover.map((part) => drawnTexts(part)[0])).toEqual([
      'Build window shell',
      'Hill-climb mode for judges',
    ]);

    expect(fills).toEqual([[palette.hover], [palette.hover]]);
  });

  test('the list dismiss control dismisses every ask without a jump', () => {
    const list = listElement(rows, actions);

    const dismiss = elementsWithStyle(list, 'id').find(
      (part) => part.styles['id']?.[0] === 'koja-ask-list-dismiss',
    );

    expect(dismiss).toBeDefined();

    if (dismiss !== undefined) {
      click(dismiss);
    }

    expect(calls).toEqual(['dismissList']);
  });
});

describe('cardElement', () => {
  test('draws the space, the agent, the question, and the command', () => {
    const card = cardElement(ask, null, null, actions);

    expect(drawnTexts(card)).toEqual([
      'Build window shell',
      'Claude Code',
      'Allow this command?',
      'bun run sandbox up',
    ]);

    expect(drawnIcons(card)).toEqual(['message-circle-question.svg', 'x.svg']);
  });

  test('draws a question ask without a command line', () => {
    const card = cardElement(questionAsk, null, null, actions);

    expect(drawnTexts(card)).toEqual(['Build window shell', 'Claude Code', 'Which judge model?']);
  });

  test('draws the jump key and its hint under the question', () => {
    const card = cardElement(ask, null, needsYouHint, actions);
    const texts = drawnTexts(card);

    expect(texts).toEqual([
      'Build window shell',
      'Claude Code',
      'Allow this command?',
      'bun run sandbox up',
      ...needsYouHint.keys,
      needsYouHint.text,
    ]);
  });

  test('marks the hint row and its text as shrinkable', () => {
    const card = cardElement(ask, null, needsYouHint, actions);
    const text = elementWithText(card, needsYouHint.text);

    const row = elementsWithId(card, 'koja-ask-hint')[0];

    expect(text?.styles['truncate']).toBeDefined();
    expect(row?.styles['min_w']).toEqual([0]);
  });

  test('draws one more line naming the next ask space', () => {
    const without = drawnTexts(cardElement(ask, null, null, actions));
    const withMore = drawnTexts(cardElement(ask, { count: 2, space: 'Hill-climb' }, null, actions));

    expect(withMore).toEqual([...without, '2 more asks in Hill-climb']);
  });

  test('a click on the card goes to the ask', () => {
    const card = cardElement(ask, null, null, actions);

    const clickable = elementsWithStyle(card, 'cursor_pointer')[0];

    expect(clickable).toBeDefined();

    if (clickable !== undefined) {
      click(clickable);
    }

    expect(calls).toEqual(['go']);
  });

  test('a click on the more line opens the list without going to the ask', () => {
    const card = cardElement(ask, { count: 2, space: 'Hill-climb' }, null, actions);

    const more = elementsWithStyle(card, 'id').find(
      (part) => part.styles['id']?.[0] === 'koja-ask-more',
    );

    expect(more).toBeDefined();

    let stopped = 0;

    if (more !== undefined) {
      click(more, {
        stop_propagation: () => {
          stopped += 1;
        },
      });
    }

    expect(stopped).toBe(1);
    expect(calls).toEqual(['open']);
  });

  test('the dismiss control marks the ask dismissed without going to it', () => {
    const card = cardElement(ask, null, null, actions);

    const dismiss = elementsWithId(card, 'koja-ask-dismiss')[0];

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
