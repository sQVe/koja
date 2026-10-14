import { useTerminalDimensions } from '@opentui/react';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { shownView } from '../client/client.ts';
import type { AttachSession } from '../client/client.ts';
import { sideListWidth } from '../layout.ts';

const statusBarRows = 1;

// Shows the entries that fit, scrolled only as far as needed to keep the focused one in view.
const visibleStart = (count: number, focusedIndex: number, rows: number): number => {
  const lastStart = Math.max(0, count - rows);

  return Math.min(lastStart, Math.max(0, focusedIndex - rows + 1));
};

export const SideList = ({ session }: { session: AttachSession }): ReactNode => {
  const { snapshot } = useSyncExternalStore(session.subscribe, session.getState);
  const { height, width } = useTerminalDimensions();
  const rows = Math.max(1, height - statusBarRows);
  const { focusedWorkspaceId } = shownView(snapshot);
  const focusedIndex = snapshot.workspaces.findIndex((w) => w.id === focusedWorkspaceId);
  const start = visibleStart(snapshot.workspaces.length, focusedIndex, rows);
  const shown = snapshot.workspaces.slice(start, start + rows);

  if (sideListWidth(width) === 0) {
    return null;
  }

  return (
    <box width={sideListWidth(width)} flexShrink={0} flexDirection="column" overflow="hidden">
      {shown.map((workspace) => {
        const marker = workspace.id === focusedWorkspaceId ? '>' : ' ';

        return (
          <text key={workspace.id} height={1} wrapMode="none">
            {`${marker} ${workspace.label}`}
          </text>
        );
      })}
    </box>
  );
};
