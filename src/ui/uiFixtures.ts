import { afterEach } from 'bun:test';

import type { TestRendererSetup } from '@opentui/core/testing';
import { testRender } from '@opentui/react/test-utils';
import { act } from 'react';
import type { ReactNode } from 'react';

import type { AttachSession } from '../client/client.ts';
import { firstWorkspace, secondWorkspace, storeSnapshotOf } from './inputFixtures.ts';

interface DrawnSpan {
  text: string;
  fg: string;
  bg: string;
}

let setup: TestRendererSetup | undefined;

afterEach(() => {
  act(() => setup?.renderer.destroy());
  setup = undefined;
});

const state = {
  snapshot: storeSnapshotOf({ ids: [firstWorkspace, secondWorkspace], focused: firstWorkspace }),
  inputMode: 'insert' as const,
};

export const fixedSession: Pick<AttachSession, 'subscribe' | 'getState'> = {
  subscribe: () => () => undefined,
  getState: () => state,
};

// Every span of every row, with the color intent of its foreground and background.
export const drawnSpans = async (node: ReactNode): Promise<DrawnSpan[]> => {
  const created = await testRender(node, { width: 60, height: 6 });

  setup = created;
  await created.renderOnce();

  return created
    .captureSpans()
    .lines.flatMap((line) =>
      line.spans.map((span) => ({ text: span.text, fg: span.fg.intent, bg: span.bg.intent })),
    );
};

export const textSpans = (spans: DrawnSpan[]): DrawnSpan[] =>
  spans.filter((span) => span.text.trim() !== '');
