import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { AttachSession, StoreSnapshot } from '../client/client.ts';

const tabLabels = (snapshot: StoreSnapshot): string => {
  const workspace = snapshot.workspaces.find((known) => known.id === snapshot.focusedWorkspaceId);

  if (workspace === undefined) {
    return '';
  }

  return workspace.tabIds
    .map((id, index) => (id === workspace.activeTabId ? `[${index + 1}]` : `${index + 1}`))
    .join(' ');
};

export const StatusBar = ({ session }: { session: AttachSession }): ReactNode => {
  const state = useSyncExternalStore(session.subscribe, session.getState);

  const tabs = tabLabels(state.snapshot);

  const line =
    tabs === '' ? state.inputMode.toUpperCase() : `${state.inputMode.toUpperCase()} ${tabs}`;

  return (
    <text height={1} flexShrink={0}>
      {line}
    </text>
  );
};
