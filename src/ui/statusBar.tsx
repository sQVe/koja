import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { AttachSession } from '../client/client.ts';
import { statusBarLine, tabLabelsOf } from './screenTargets.ts';

export const StatusBar = ({ session }: { session: AttachSession }): ReactNode => {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const labels = tabLabelsOf(state.snapshot, state.inputMode);

  return (
    <text height={1} flexShrink={0}>
      {statusBarLine(state.inputMode, labels)}
    </text>
  );
};
