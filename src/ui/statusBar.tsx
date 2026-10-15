import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { activeTabIdOf, shownView } from '../client/client.ts';
import type { AttachSession, StoreSnapshot } from '../client/client.ts';

export const tabEntry = (number: number, label: string | undefined, active: boolean): string => {
  const name = label === undefined ? `${number}` : `${number}:${label}`;

  return active ? `[${name}]` : name;
};

const tabLabels = (snapshot: StoreSnapshot): string => {
  const view = shownView(snapshot);
  const workspace = snapshot.workspaces.find((known) => known.id === view.focusedWorkspaceId);

  if (workspace === undefined) {
    return '';
  }

  const activeId = activeTabIdOf(view, workspace.id);

  return workspace.tabIds
    .map((id, index) => {
      const label = snapshot.tabs.find((tab) => tab.id === id)?.label;

      return tabEntry(index + 1, label, id === activeId);
    })
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
