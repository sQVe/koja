import type { PaneId } from '../ids.ts';
import { piRecordOf, savedSessionOf } from '../store/store.ts';
import type { Change, Intent, SavedSession, State } from '../store/store.ts';
import type { Log } from './log.ts';
import type { RunningPane } from './paneRecord.ts';
import { isSavedSessionFile } from './piReports.ts';
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

const readSavedSessionFiles = (state: State): Set<string> => {
  const files = new Set<string>();

  for (const pane of state.panes) {
    const sessionFile = piRecordOf(state, pane.id)?.report.sessionFile;

    if (sessionFile !== undefined && isSavedSessionFile(sessionFile)) {
      files.add(sessionFile);
    }
  }

  return files;
};

export const currentSession = (context: SessionContext): SavedSession =>
  savedSessionOf(context.state, {
    folders: readSavedFolders(context),
    savedSessionFiles: readSavedSessionFiles(context.state),
  });

export const unusableKindOf = (saved: SessionRead | undefined): 'broken' | 'newer' | undefined => {
  if (saved?.kind === 'broken' || saved?.kind === 'newer') {
    return saved.kind;
  }

  return undefined;
};

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
