import { RGBA } from '@opentui/core';
import { useTerminalDimensions } from '@opentui/react';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { actionCatalog } from '../actions.ts';
import type { AttachSession } from '../client/client.ts';
import { actionViewLines, actionViewRowsOf } from './actionView.ts';
import type { ActionView, ActionViewLine, ActionViewState } from './actionView.ts';

const keyColumnWidth = 6;

const headingOf = (state: ActionViewState): string =>
  state.kind === 'search' ? `Search actions: ${state.query}` : 'Shortcuts';

const lineTextOf = (line: ActionViewLine): string => {
  const marker = line.selected ? '>' : ' ';
  const unavailable = line.unavailable ? ' (unavailable)' : '';

  return `${marker} ${line.key.padEnd(keyColumnWidth)} ${line.title}${unavailable}`;
};

// Draws the open view over the rows above the status bar. It sits after the pane area, so the
// pane renderables stay mounted and the status bar keeps its row.
export const ActionOverlay = ({
  session,
  view,
}: {
  session: Pick<AttachSession, 'subscribe' | 'getState'>;
  view: ActionView;
}): ReactNode => {
  const state = useSyncExternalStore(view.subscribe, view.getState);
  const { snapshot } = useSyncExternalStore(session.subscribe, session.getState);
  const { height } = useTerminalDimensions();

  if (state.kind === 'closed') {
    return null;
  }

  const lines = actionViewLines(actionCatalog, snapshot, state, actionViewRowsOf(height));

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      flexDirection="column"
      backgroundColor={RGBA.defaultBackground()}
      overflow="hidden"
    >
      <text height={1} wrapMode="none" fg={RGBA.defaultForeground()}>
        {headingOf(state)}
      </text>
      {lines.map((line) => (
        <text key={line.id} height={1} wrapMode="none" fg={RGBA.defaultForeground()}>
          {lineTextOf(line)}
        </text>
      ))}
    </box>
  );
};
