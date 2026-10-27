import type { PaneId } from '../ids.ts';
import { savedSessionOf } from '../store/store.ts';
import type { Change, Intent, SavedSession, State } from '../store/store.ts';
import type { Log } from './log.ts';
import type { RunningPane } from './paneRecord.ts';
import { readSavedFolder } from './processInfo.ts';
import type { readSessionFile } from './sessionFile.ts';

interface SessionContext {
  state: State;
  runtime: { panes: Map<PaneId, RunningPane> };
}

type SessionRead = Awaited<ReturnType<typeof readSessionFile>>;

const sessionChangeTypes: ReadonlySet<Change['type']> = new Set([
  'workspaceAdded',
  'tabAdded',
  'paneAdded',
  'workspaceFocused',
  'workspaceRenamed',
  'tabFocused',
  'tabRenamed',
  'workspaceRemoved',
  'tabRemoved',
  'paneRemoved',
  'paneMoved',
  'tabLayoutChanged',
  'paneFocused',
  'tabZoomChanged',
]);

export const savesSession = (changes: readonly Change[]): boolean =>
  changes.some((change) => sessionChangeTypes.has(change.type));

const readSavedFolders = (context: SessionContext): Map<PaneId, string> => {
  const folders = new Map<PaneId, string>();

  for (const [paneId, running] of context.runtime.panes) {
    const folder = readSavedFolder(running.runtime.processId);

    if (folder !== undefined) {
      folders.set(paneId, folder);
    }
  }

  return folders;
};

export const currentSession = (context: SessionContext): SavedSession =>
  savedSessionOf(context.state, readSavedFolders(context));

// The writer copies a file that is broken or newer before its first save replaces it.
export const unusableKindOf = (saved: SessionRead | undefined): 'broken' | 'newer' | undefined => {
  if (saved?.kind === 'broken' || saved?.kind === 'newer') {
    return saved.kind;
  }

  return undefined;
};

// Leaves a file that is broken or newer in place. The writer copies it before the next save.
export const restoreSession = (
  log: Log,
  dispatch: (intent: Intent) => readonly Change[],
  path: string,
  saved: SessionRead | undefined,
): void => {
  if (saved?.kind === 'restored') {
    dispatch({ type: 'restoreSession', session: saved.session });
  }

  if (saved?.kind === 'broken') {
    log.warn(
      'Cannot read the saved session, so the server starts empty. The next save keeps a copy of it first.',
      {
        path,
        message: saved.message,
      },
    );
  }

  if (saved?.kind === 'newer') {
    log.warn(
      'The saved session is from a newer version, so the server starts empty. The next save keeps a copy of it first.',
      {
        path,
        version: saved.version,
      },
    );
  }
};
