import { paneCommandOf } from '../actions.ts';
import type { PaneAction } from '../actions.ts';
import { viewedPane } from '../client/client.ts';
import type { AttachSession } from '../client/client.ts';

type PaneSession = Pick<AttachSession, 'getState' | 'changePaneLayout'>;

export const runPaneAction = (session: PaneSession, action: PaneAction): Promise<void> => {
  const { snapshot } = session.getState();
  const current = viewedPane(snapshot);

  if (current === undefined) {
    return Promise.resolve();
  }

  const command = paneCommandOf(snapshot, current.id, action);

  return command === undefined ? Promise.resolve() : session.changePaneLayout(command);
};
