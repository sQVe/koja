import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnTexts, elementWithText } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

interface SceneTokens {
  ink: { dim: string };
  text: { detail: { size: number } };
}

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));
await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({ icon: (name: string) => drawn(name) }),
);

const sidebarPath = './sidebar.ts';
const statesPath = './states.ts';
const tokensPath = '../koja.ts';
const contentPath = './content.ts';

const { mapSidebar, mapSidebarOf, inboxSidebar } = (await import(sidebarPath)) as {
  mapSidebar: (tokens: unknown) => DrawnElement;
  mapSidebarOf: (projects: unknown, tokens: unknown) => DrawnElement;
  inboxSidebar: (tokens: unknown) => DrawnElement;
};

const { machineTagScene } = (await import(statesPath)) as {
  machineTagScene: (tokens: unknown) => DrawnElement;
};

const { koja, kojaNormal } = (await import(tokensPath)) as {
  koja: SceneTokens;
  kojaNormal: SceneTokens;
};

const { fakeProjects } = (await import(contentPath)) as {
  fakeProjects: { name: string; spaces: { selected: boolean; age: string }[] }[];
};

afterAll(() => {
  mock.restore();
});

const scenes = [
  { name: 'direction-koja', tokens: koja, render: () => mapSidebar(koja) },
  { name: 'direction-koja-normal', tokens: kojaNormal, render: () => mapSidebar(kojaNormal) },
  { name: 'sidebar-states', tokens: koja, render: () => machineTagScene(koja) },
];

test.each(scenes)('$name shows only non-working, non-selected row ages', (scene) => {
  const sidebar = scene.render();
  const texts = drawnTexts(sidebar);

  expect(texts).toContain('Tau workflow sidebar');
  expect(texts).toContain('Design the sidebar');

  for (const age of ['2m', '18m', '1h', '1d', '3d']) {
    expect(texts).toContain(age);
    expect(elementWithText(sidebar, age)?.textColors).toEqual([scene.tokens.ink.dim]);

    expect(elementWithText(sidebar, age)?.styles['text_size']).toEqual([
      scene.tokens.text.detail.size,
    ]);
  }

  for (const age of ['now', '5m', '1m']) {
    expect(texts).not.toContain(age);
  }
});

test('a selected non-working row has no age', () => {
  const projects = fakeProjects.map((project) => ({
    ...project,
    spaces: project.spaces.map((space) => ({ ...space, selected: space.age === '18m' })),
  }));

  const texts = drawnTexts(mapSidebarOf(projects, koja));

  expect(texts).toContain('Tau workflow sidebar');
  expect(texts).not.toContain('18m');
  expect(texts).toContain('2m');
});

test('inbox rows have no ages', () => {
  const texts = drawnTexts(inboxSidebar(koja));

  for (const project of fakeProjects) {
    for (const space of project.spaces) {
      expect(texts).not.toContain(space.age);
    }
  }
});
