import { expect, it } from 'bun:test';

import type { AttachSession } from '../client/client.ts';
import { firstWorkspace, storeSnapshotOf } from './inputFixtures.ts';
import { Screen } from './ui.tsx';
import { drawnSpans, textSpans } from './uiFixtures.ts';

const sessionOf = (
  snapshot: ReturnType<typeof storeSnapshotOf>,
): Pick<AttachSession, 'subscribe' | 'getState'> => {
  const state = { snapshot, inputMode: 'normal' as const };

  return {
    subscribe: () => () => undefined,
    getState: () => state,
  };
};

const screenText = async (
  session: Pick<AttachSession, 'subscribe' | 'getState'>,
): Promise<string> =>
  textSpans(await drawnSpans(<Screen session={session} placePane={() => undefined} />))
    .map((span) => span.text)
    .join('');

it('shows the create hint for a focused workspace with no tabs', async () => {
  const session = sessionOf(
    storeSnapshotOf({ ids: [firstWorkspace], focused: firstWorkspace }, []),
  );

  const text = await screenText(session);

  expect(text).toContain('Press t to create a tab');
  expect(text).not.toContain('No workspace');
});

it('shows the open-a-workspace hint when no workspace is focused', async () => {
  const session = sessionOf(storeSnapshotOf({ ids: [], focused: undefined }, []));

  const text = await screenText(session);

  expect(text).toContain('No workspace is open');
});
