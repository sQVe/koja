import type { PaneId } from '../ids.ts';
import type {
  Fact,
  MalformedPiRecord,
  Pane,
  PiRecovery,
  SavedPiRecord,
  State,
} from '../store/store.ts';
import type { Log } from './log.ts';
import { checkPiRecoveries, piRecoveryMessage } from './piRecovery.ts';
import { readLiveProcess } from './piReports.ts';
import { readPiSessionFile } from './piSessionFile.ts';
import type { readSessionFile } from './sessionFile.ts';

type SessionRead = Awaited<ReturnType<typeof readSessionFile>>;

interface PiRecoveryStartContext {
  options: { log: Log };
  state: State;
  runtime: { piRecoveries: Map<PaneId, PiRecovery> };
}

export const checkSavedPi = async (
  saved: SessionRead | undefined,
): Promise<Map<PaneId, PiRecovery>> => {
  const records = new Map<PaneId, SavedPiRecord | MalformedPiRecord>();

  if (saved?.kind !== 'restored') {
    return new Map();
  }

  for (const { id, pi } of saved.session.panes) {
    if (pi !== undefined) {
      records.set(id, pi);
    }
  }

  return checkPiRecoveries(records, { readSessionFile: readPiSessionFile, readLiveProcess });
};

const sessionFileOf = (state: State, id: PaneId): string | undefined => {
  const pi = state.restoredPi.get(id)?.pi;

  return pi === undefined || 'kind' in pi ? undefined : pi.sessionFile;
};

export const admitRestoredPane = (
  context: PiRecoveryStartContext,
  pane: Pane,
  report: (fact: Fact) => void,
): boolean => {
  const { id, generation } = pane;
  const recovery = context.runtime.piRecoveries.get(id);

  if (!pane.restored || recovery === undefined) {
    return true;
  }

  context.runtime.piRecoveries.delete(id);

  const sessionFile = sessionFileOf(context.state, id);

  report({ type: 'piRecoveryChecked', paneId: id, generation, recovery });

  if (recovery.status === 'ready') {
    return true;
  }

  const message = piRecoveryMessage(recovery, sessionFile);

  context.options.log.error('The restored pane cannot reopen its pi conversation.', {
    paneId: id,
    message,
  });

  report({ type: 'paneFailedToStart', paneId: id, generation, message });

  return false;
};
