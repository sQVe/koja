import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { AttachSession } from '../client/client.ts';
import type { PanePaste } from './panePaste.ts';
import { statusBarLine, tabLabelsOf } from './screenTargets.ts';

export const StatusBar = ({
  session,
  pasteFlow,
}: {
  session: AttachSession;
  pasteFlow: PanePaste;
}): ReactNode => {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const pasteStatus = useSyncExternalStore(pasteFlow.subscribe, pasteFlow.getStatus);
  const labels = tabLabelsOf(state.snapshot, state.inputMode, pasteStatus);

  return (
    <text height={1} flexShrink={0}>
      {statusBarLine(state.inputMode, labels, pasteStatus)}
    </text>
  );
};
