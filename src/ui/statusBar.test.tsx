import { expect, it } from 'bun:test';

import type { PanePaste } from './panePaste.ts';
import { StatusBar } from './statusBar.tsx';
import { drawnSpans, fixedSession, textSpans } from './uiFixtures.ts';

const pasteFlow = {
  subscribe: () => () => undefined,
  getStatus: () => undefined,
} as unknown as PanePaste;

it('draws the status bar text in the terminal default foreground', async () => {
  const text = textSpans(
    await drawnSpans(<StatusBar session={fixedSession} pasteFlow={pasteFlow} />),
  );

  expect(text).not.toEqual([]);
  expect(new Set(text.map((span) => span.fg))).toEqual(new Set(['default']));
});
