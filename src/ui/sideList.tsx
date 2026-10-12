import { useTerminalDimensions } from '@opentui/react';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { AttachSession } from '../client/client.ts';
import { sideListColumns } from '../layout.ts';

const statusBarRows = 1;

// Shows the entries that fit, scrolled only as far as needed to keep the focused one in view.
const visibleStart = (count: number, focusedIndex: number, rows: number): number => {
  const lastStart = Math.max(0, count - rows);

  return Math.min(lastStart, Math.max(0, focusedIndex - rows + 1));
};

export const SideList = ({ session }: { session: AttachSession }): ReactNode => {
  const { snapshot } = useSyncExternalStore(session.subscribe, session.getState);
  const { height } = useTerminalDimensions();
  const rows = Math.max(1, height - statusBarRows);
  const focusedIndex = snapshot.workspaces.findIndex((w) => w.id === snapshot.focusedWorkspaceId);
  const start = visibleStart(snapshot.workspaces.length, focusedIndex, rows);
  const shown = snapshot.workspaces.slice(start, start + rows);

  return (
    <box width={sideListColumns} flexShrink={0} flexDirection="column" overflow="hidden">
      {shown.map((workspace) => {
        const marker = workspace.id === snapshot.focusedWorkspaceId ? '>' : ' ';

        return (
          <text key={workspace.id} height={1} wrapMode="none">
            {`${marker} ${workspace.label}`}
          </text>
        );
      })}
    </box>
  );
};
