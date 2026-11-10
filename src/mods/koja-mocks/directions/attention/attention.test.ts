import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { clickablesWithText, drawn, drawnIcons, drawnTexts } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

interface Tokens {
  normal: boolean;
}

interface Ask {
  space: string;
  question: string;
}

interface MixState {
  asks: readonly Ask[];
  listOpen: boolean;
  dismissed: boolean;
}

type Scene = (tokens: Tokens) => DrawnElement;

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));
await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({ icon: (name: string) => drawn(name) }),
);

const cornerPath = './corner.ts';
const briefPath = './brief.ts';
const mixPath = './mix.ts';
const tokensPath = '../koja.ts';
const catalogPath = '../../catalog.ts';

const { cornerScene } = (await import(cornerPath)) as { cornerScene: Scene };
const { briefScene } = (await import(briefPath)) as { briefScene: Scene };
const { findScene } = (await import(catalogPath)) as { findScene: (name: string) => object };

const { createMixState, mixScene } = (await import(mixPath)) as {
  createMixState: (asks?: readonly Ask[]) => MixState;
  mixScene: (open: boolean, tokens: Tokens, state?: MixState) => DrawnElement;
};

const { koja, kojaNormal } = (await import(tokensPath)) as {
  koja: Tokens;
  kojaNormal: Tokens;
};

afterAll(() => {
  mock.restore();
});

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const directRow = (scene: DrawnElement, title: string): DrawnElement => {
  const row = descendants(scene).find((element) =>
    element.kids.some((child) => child.texts.includes(title)),
  );

  if (row === undefined) {
    throw new Error(`No row for ${title}`);
  }

  return row;
};

const hasKeys = (scene: DrawnElement): boolean => {
  const texts = drawnTexts(scene);

  return texts.includes('g') && texts.includes('n');
};

const headerFields = (header: DrawnElement): string[] => {
  const own = header.path === null ? header.texts : [header.path];

  return [...own, ...header.kids.flatMap(headerFields)];
};

const activate = (element: DrawnElement | undefined): number => {
  let notifications = 0;

  element?.clickHandlers[0]?.(
    {},
    {
      stop_propagation: () => undefined,
      notify: () => {
        notifications += 1;
      },
    },
  );

  return notifications;
};

const dismissButton = (scene: DrawnElement): DrawnElement | undefined =>
  descendants(scene).find(
    (element) => element.clickHandlers.length > 0 && drawnIcons(element).includes('x'),
  );

const scenes = [
  { name: 'brief', draw: briefScene, leading: false },
  { name: 'mix', draw: (tokens: Tokens) => mixScene(false, tokens), leading: true },
];

const headerCases = scenes.flatMap((scene) => [
  { ...scene, mode: 'insert', tokens: koja },
  { ...scene, mode: 'normal', tokens: kojaNormal },
]);

describe('attention scenes', () => {
  test('corner keeps its single hidden ask and summary in both modes', () => {
    const scene = cornerScene(koja);
    const texts = drawnTexts(scene);

    expect(texts).toContain('Claude Code asks to run bun run sandbox up.');
    expect(texts).toContain('1 more ask');
    expect(texts).not.toContain('Which judge model for round 2?');
    expect(hasKeys(scene)).toBe(false);
    expect(hasKeys(cornerScene(kojaNormal))).toBe(true);
    expect(drawnIcons(directRow(scene, 'Mock scenes'))).toEqual(['terminal', 'circle-alert']);

    expect(drawnIcons(directRow(scene, 'Pi'))).toEqual([
      'terminal',
      'message-circle-question',
      'ellipsis',
    ]);
  });

  test('discarded attention takes cannot be opened', () => {
    const removed = [
      'attention-bar',
      'attention-bar-normal',
      'attention-bar-list',
      'attention-source',
      'attention-source-normal',
      'attention-stack',
      'attention-stack-normal',
      'attention-list',
      'attention-list-normal',
    ];

    for (const name of removed) {
      expect(findScene(name)).toHaveProperty('error');
    }
  });

  test('brief keeps its short prompt without question or agent details', () => {
    const texts = drawnTexts(briefScene(koja));

    expect(texts).toContain('Build window shell asks you');
    expect(texts).toContain('1 more ask');
    expect(texts).not.toContain('bun run sandbox up');
    expect(texts).not.toContain('Which judge model for round 2?');
    expect(texts).not.toContain('Claude Code · Build shell');
  });

  test('mix shows the newest hidden question and an expandable remaining count', () => {
    const scene = mixScene(false, koja);
    const texts = drawnTexts(scene);
    const count = clickablesWithText(scene, '1 more ask in Hill-climb mode for judges');

    expect(texts).toContain('bun run sandbox up');
    expect(texts).not.toContain('Which judge model for round 2?');
    expect(count).toHaveLength(1);
    expect(drawnIcons(count[0] ?? drawn())).toContain('chevron-right');
    expect(dismissButton(scene)).toBeDefined();
  });

  test('clicking the count opens both hidden asks newest first', () => {
    const state = createMixState();
    const closed = mixScene(false, koja, state);

    const notifications = activate(
      clickablesWithText(closed, '1 more ask in Hill-climb mode for judges')[0],
    );

    const opened = mixScene(false, koja, state);
    const texts = drawnTexts(opened);

    expect(notifications).toBe(1);
    expect(texts).toContain('2 asks in other spaces');
    expect(texts).toContain('Claude Code · Allow this command?');
    expect(texts).toContain('Pi · Which judge model for round 2?');

    expect(texts.indexOf('Claude Code · Allow this command?')).toBeLessThan(
      texts.indexOf('Pi · Which judge model for round 2?'),
    );

    expect(texts).not.toContain('1 more ask in Hill-climb mode for judges');
  });

  test('the opened capture starts with both hidden asks and no insert-mode keys', () => {
    const scene = mixScene(true, koja);
    const texts = drawnTexts(scene);

    expect(texts).toContain('2 asks in other spaces');
    expect(texts).toContain('Claude Code · Allow this command?');
    expect(texts).toContain('Pi · Which judge model for round 2?');
    expect(hasKeys(scene)).toBe(false);
  });

  test.each([
    { mode: 'closed', open: false },
    { mode: 'open', open: true },
  ])('dismiss hides the $mode attention card without removing the panes', ({ open }) => {
    const state = createMixState();
    const notifications = activate(dismissButton(mixScene(open, koja, state)));
    const after = mixScene(open, koja, state);
    const texts = drawnTexts(after);

    expect(notifications).toBe(1);
    expect(texts).not.toContain('bun run sandbox up');
    expect(texts).not.toContain('Which judge model for round 2?');
    expect(texts).not.toContain('1 more ask in Hill-climb mode for judges');
    expect(texts).toContain('Claude Code');
    expect(texts).toContain('Pi');
    expect(dismissButton(after)).toBeUndefined();
  });

  test('one hidden ask has no remaining count or list control', () => {
    const state = createMixState();
    state.asks = state.asks.slice(0, 1);
    const scene = mixScene(false, koja, state);

    expect(drawnTexts(scene)).toContain('bun run sandbox up');
    expect(drawnTexts(scene)).not.toContain('1 more ask in Hill-climb mode for judges');
    expect(drawnIcons(scene)).not.toContain('chevron-right');
  });

  test('no hidden asks leaves the attention card absent', () => {
    const scene = mixScene(false, koja, createMixState([]));

    expect(dismissButton(scene)).toBeUndefined();
    expect(drawnTexts(scene)).not.toContain('1 more ask in Hill-climb mode for judges');
    expect(drawnTexts(scene)).toContain('Claude Code');
  });

  test.each(scenes)('$name shows navigation hints only in normal mode', ({ draw }) => {
    expect(hasKeys(draw(koja))).toBe(false);
    expect(hasKeys(draw(kojaNormal))).toBe(true);
  });

  test.each(headerCases)(
    '$name in $mode preserves pane fields and places status at the chosen end',
    ({ draw, leading, tokens }) => {
      const scene = draw(tokens);
      const claudeFields = headerFields(directRow(scene, 'Claude Code'));
      const piFields = headerFields(directRow(scene, 'Pi'));
      const claudeStart = leading ? 'loader-circle' : 'terminal';
      const piStart = leading ? 'message-circle-question' : 'terminal';

      const expectedClaude = [
        claudeStart,
        'Claude Code',
        'Design the sidebar',
        'git-branch',
        'me-1090-design-the-sidebar',
        '~/code/koja',
      ];

      const expectedPi = [piStart, 'Pi', 'Review findings', 'git-branch', 'main', '~/code/koja'];

      if (!leading) {
        expectedClaude.push('loader-circle');
        expectedPi.push('message-circle-question');
      }

      expectedClaude.push('ellipsis');
      expectedPi.push('ellipsis');

      expect(claudeFields).toEqual(expectedClaude);
      expect(piFields).toEqual(expectedPi);

      const tabIcons = leading ? ['circle-alert'] : ['terminal', 'circle-alert'];

      expect(drawnIcons(directRow(scene, 'Mock scenes'))).toEqual(tabIcons);
    },
  );
});
