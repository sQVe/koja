import { afterEach, expect, it } from 'bun:test';

import type { TestRendererSetup } from '@opentui/core/testing';
import { testRender } from '@opentui/react/test-utils';
import { act } from 'react';
import type { ReactNode } from 'react';

import type { AttachSession } from '../client/client.ts';
import { ActionOverlay } from './actionOverlay.tsx';
import { createActionView } from './actionView.ts';
import { firstWorkspace, secondWorkspace, storeSnapshotOf } from './inputFixtures.ts';
import type { PanePaste } from './panePaste.ts';
import { StatusBar } from './statusBar.tsx';
import { SideList } from './workspaceList.tsx';

let setup: TestRendererSetup | undefined;

afterEach(() => {
  act(() => setup?.renderer.destroy());
  setup = undefined;
});

const snapshot = storeSnapshotOf({
  ids: [firstWorkspace, secondWorkspace],
  focused: firstWorkspace,
});

const state = { snapshot, inputMode: 'insert' as const };

const session = {
  subscribe: () => () => undefined,
  getState: () => state,
} as unknown as AttachSession;

const pasteFlow = {
  subscribe: () => () => undefined,
  getStatus: () => undefined,
} as unknown as PanePaste;

const textIntents = async (node: ReactNode, row: number) => {
  const created = await testRender(node, { width: 60, height: 6 });

  setup = created;
  await created.renderOnce();

  const spans = created.captureSpans().lines[row]?.spans ?? [];
  const drawn = spans.filter((span) => span.text.trim() !== '');

  return {
    text: drawn.map((span) => span.text).join(''),
    fg: drawn.map((span) => span.fg.intent),
    bg: drawn.map((span) => span.bg.intent),
  };
};

it('draws the status bar in the terminal default colors', async () => {
  const drawn = await textIntents(<StatusBar session={session} pasteFlow={pasteFlow} />, 0);

  expect(drawn.text).not.toBe('');
  expect([...new Set(drawn.fg)]).toEqual(['default']);
});

it('draws the workspace list in the terminal default colors', async () => {
  const drawn = await textIntents(<SideList session={session} />, 0);

  expect(drawn.text).toContain('koja');
  expect([...new Set(drawn.fg)]).toEqual(['default']);
});

it('draws the action overlay in the terminal default colors', async () => {
  const view = createActionView(() => 4);

  view.open('help');

  const drawn = await textIntents(<ActionOverlay session={session} view={view} />, 0);

  expect(drawn.text).toContain('Shortcuts');
  expect([...new Set(drawn.fg)]).toEqual(['default']);
  expect([...new Set(drawn.bg)]).toEqual(['default']);
});
