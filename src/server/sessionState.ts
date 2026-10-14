import type { PaneId } from '../ids.ts';
import { savedSessionOf } from '../store/store.ts';
import type { Change, Intent, SavedSession, State } from '../store/store.ts';
import type { Log } from './log.ts';
import type { PaneRuntime } from './pane.ts';
import { readProcessFolder } from './processInfo.ts';
import type { readSessionFile } from './sessionFile.ts';

interface SessionContext {
  state: State;
  runtime: { panes: Map<PaneId, PaneRuntime> };
}

const sessionChangeTypes: ReadonlySet<Change['type']> = new Set([
  'workspaceAdded',
  'tabAdded',
  'paneAdded',
  'workspaceFocused',
  'workspaceRenamed',
  'tabFocused',
  'workspaceRemoved',
  'tabRemoved',
  'paneRemoved',
  'tabLayoutChanged',
  'paneFocused',
  'tabZoomChanged',
]);

export const savesSession = (changes: readonly Change[]): boolean =>
  changes.some((change) => sessionChangeTypes.has(change.type));

const readSavedFolders = (context: SessionContext): Map<PaneId, string> => {
  const folders = new Map<PaneId, string>();

  for (const [paneId, runtime] of context.runtime.panes) {
    const folder = readProcessFolder(runtime.processId);

    if (folder !== undefined) {
      folders.set(paneId, folder);
    }
  }

  return folders;
};

export const currentSession = (context: SessionContext): SavedSession =>
  savedSessionOf(context.state, readSavedFolders(context));

// Leaves a file that is broken or newer as it is, until the next save replaces it.
export const restoreSession = (
  log: Log,
  dispatch: (intent: Intent) => readonly Change[],
  path: string,
  saved: Awaited<ReturnType<typeof readSessionFile>> | undefined,
): void => {
  if (saved?.kind === 'restored') {
    dispatch({ type: 'restoreSession', session: saved.session });
  }

  if (saved?.kind === 'broken') {
    log.warn('Cannot read the saved session, so the server starts empty.', {
      path,
      message: saved.message,
    });
  }

  if (saved?.kind === 'newer') {
    log.warn('The saved session is from a newer version, so the server starts empty.', {
      path,
      version: saved.version,
    });
  }
};
