import { expect, it } from 'bun:test';

import { drawnSpans, fixedSession, textSpans } from './uiFixtures.ts';
import { SideList } from './workspaceList.tsx';

it('draws every workspace in the terminal default foreground', async () => {
  const text = textSpans(await drawnSpans(<SideList session={fixedSession} />));

  expect(text.map((span) => span.text.trim())).toEqual(['> koja', 'koja']);
  expect(new Set(text.map((span) => span.fg))).toEqual(new Set(['default']));
});
