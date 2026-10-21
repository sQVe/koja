import { viewedPane } from '../client/client.ts';
import type { AttachSession } from '../client/client.ts';
import type { PaneId, TabId } from '../ids.ts';
import { layoutPanes } from '../layout.ts';

export type PaneAction =
  | 'splitBelow'
  | 'splitRight'
  | 'focusPrevious'
  | 'focusNext'
  | 'close'
  | 'breakPane'
  | 'zoom'
  | 'resizeLeft'
  | 'resizeRight'
  | 'resizeUp'
  | 'resizeDown';

type PaneSession = Pick<
  AttachSession,
  'getState' | 'splitPane' | 'focusPane' | 'closePane' | 'movePane' | 'zoomPane' | 'resizePane'
>;

const focusNeighbor = (
  session: PaneSession,
  current: { id: PaneId; tabId: TabId },
  offset: number,
): Promise<void> => {
  const tab = session.getState().snapshot.tabs.find((known) => known.id === current.tabId);

  if (tab === undefined) {
    return Promise.resolve();
  }

  const order = layoutPanes(tab.layout, { columns: 1, rows: 1 }).map((place) => place.paneId);
  const target = order[order.indexOf(current.id) + offset];

  return target === undefined ? Promise.resolve() : session.focusPane(target);
};

const resizeDirections: Partial<Record<PaneAction, 'left' | 'right' | 'up' | 'down'>> = {
  resizeLeft: 'left',
  resizeRight: 'right',
  resizeUp: 'up',
  resizeDown: 'down',
};

export const runPaneAction = (session: PaneSession, action: PaneAction): Promise<void> => {
  const current = viewedPane(session.getState().snapshot);

  if (current === undefined) {
    return Promise.resolve();
  }

  if (action === 'splitBelow') {
    return session.splitPane(current.id, 'below');
  }

  if (action === 'splitRight') {
    return session.splitPane(current.id, 'right');
  }

  if (action === 'close') {
    return session.closePane(current.id);
  }

  if (action === 'breakPane') {
    return session.movePane(current.id, { kind: 'newTab' });
  }

  if (action === 'zoom') {
    return session.zoomPane(current.id);
  }

  const resizeDirection = resizeDirections[action];

  if (resizeDirection !== undefined) {
    return session.resizePane(current.id, resizeDirection, 1);
  }

  return focusNeighbor(session, current, action === 'focusPrevious' ? -1 : 1);
};
