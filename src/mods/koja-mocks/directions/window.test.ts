import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../tests/moduleFakes.ts';

interface FakePane {
  name: string;
  task?: string;
  branch?: string;
  folder: string;
}

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake());

await mock.module('../../../kit/index.ts', () =>
  kitIndexFake({ icon: (name: string) => drawn(name), spinner: () => drawn() }),
);

// Loaded by path, so the root typecheck does not follow them into source that needs Herdr's types.
const windowPath = './window.ts';
const kojaPath = './koja.ts';
const contentPath = '../scenes/shellContent.ts';

const { directionWindow } = (await import(windowPath)) as {
  directionWindow: (tokens: unknown) => DrawnElement;
};

const { koja, kojaNormal } = (await import(kojaPath)) as { koja: unknown; kojaNormal: unknown };

const { agentPane, shellPane } = (await import(contentPath)) as {
  agentPane: FakePane;
  shellPane: FakePane;
};

afterAll(() => {
  mock.restore();
});

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const headerTexts = (window: DrawnElement, fakePane: FakePane): string[] => {
  const header = descendants(window).find(
    (part) =>
      part.kids.some((kid) => kid.texts.includes(fakePane.name)) &&
      drawnTexts(part).includes(fakePane.folder),
  );

  return header === undefined ? [] : drawnTexts(header).filter((text) => text !== '');
};

const expectedFields = (fakePane: FakePane): string[] => {
  const fields = [fakePane.name];

  if (fakePane.task !== undefined) {
    fields.push(fakePane.task);
  }

  if (fakePane.branch !== undefined) {
    fields.push(fakePane.branch);
  }

  fields.push(fakePane.folder);

  return fields;
};

const scenes = [
  { name: 'direction-koja', tokens: koja, shown: 'Insert', hidden: 'Normal' },
  { name: 'direction-koja-normal', tokens: kojaNormal, shown: 'Normal', hidden: 'Insert' },
];

describe('the koja direction scenes', () => {
  test.each(scenes)('$name shows the $shown mode pill and not $hidden', (scene) => {
    const texts = drawnTexts(directionWindow(scene.tokens));

    expect(texts).toContain(scene.shown);
    expect(texts).not.toContain(scene.hidden);
  });

  test.each(scenes)('$name shows every pane header field in order', (scene) => {
    const window = directionWindow(scene.tokens);

    expect(headerTexts(window, agentPane)).toEqual(expectedFields(agentPane));
    expect(headerTexts(window, shellPane)).toEqual(expectedFields(shellPane));
  });
});
