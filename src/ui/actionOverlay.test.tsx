import { expect, it } from 'bun:test';

import { ActionOverlay } from './actionOverlay.tsx';
import { createActionView } from './actionView.ts';
import { drawnSpans, fixedSession, textSpans } from './uiFixtures.ts';

const openOverlay = async () => {
  const view = createActionView(() => 4);

  view.open('help');

  return drawnSpans(<ActionOverlay session={fixedSession} view={view} />);
};

it('draws the heading and every action line in the terminal default foreground', async () => {
  const text = textSpans(await openOverlay());

  expect(text.map((span) => span.text).join('')).toContain('Shortcuts');
  expect(text.length).toBeGreaterThan(1);
  expect(new Set(text.map((span) => span.fg))).toEqual(new Set(['default']));
});

it('fills every cell with the terminal default background', async () => {
  const spans = await openOverlay();

  expect(new Set(spans.map((span) => span.bg))).toEqual(new Set(['default']));
});
