import type { PaneId } from '../ids.ts';
import { piRecordOf, savedSessionOf } from '../store/store.ts';
import type { Change, Intent, SavedPi, SavedSession, State } from '../store/store.ts';
import type { Log } from './log.ts';
import type { RunningPane } from './paneRecord.ts';
import { isSavedSessionFile } from './piReports.ts';
import { readSavedFolder } from './processInfo.ts';
import type { readSessionFile } from './sessionFile.ts';

interface SessionContext {
  state: State;
  runtime: { panes: Map<PaneId, RunningPane>; seenSessionFiles: Set<string> };
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

// The session files that a live or restored record names.
const namedSessionFilesOf = (state: State): Set<string> => {
  const files = new Set<string>();

  for (const pane of state.panes) {
    const sessionFile = piRecordOf(state, pane.id)?.report.sessionFile;

    if (sessionFile !== undefined) {
      files.add(sessionFile);
    }
  }

  for (const { pi } of state.restoredPi.values()) {
    if (!('kind' in pi) && pi.sessionFile !== undefined) {
      files.add(pi.sessionFile);
    }
  }

  return files;
};

// A session file stays saved once it has existed, so deleting it does not make a later save look
// like a conversation that was never saved. Only the files a record still names are kept.
const readSavedSessionFiles = (context: SessionContext): ReadonlySet<string> => {
  const { seenSessionFiles } = context.runtime;
  const named = namedSessionFilesOf(context.state);

  for (const sessionFile of named) {
    if (isSavedSessionFile(sessionFile)) {
      seenSessionFiles.add(sessionFile);
    }
  }

  for (const sessionFile of seenSessionFiles) {
    if (!named.has(sessionFile)) {
      seenSessionFiles.delete(sessionFile);
    }
  }

  return seenSessionFiles;
};

const savedFileOf = (pi: SavedPi): string | undefined => {
  if (pi === undefined || 'kind' in pi || !pi.sessionFileSaved) {
    return undefined;
  }

  return pi.sessionFile;
};

// Remembers the session files that restored records saved, before the server sees them on disk.
export const rememberSavedSessionFiles = (
  seenSessionFiles: Set<string>,
  saved: SessionRead | undefined,
): void => {
  if (saved?.kind !== 'restored') {
    return;
  }

  for (const { pi } of saved.session.panes) {
    const sessionFile = savedFileOf(pi);

    if (sessionFile !== undefined) {
      seenSessionFiles.add(sessionFile);
    }
  }
};

export const currentSession = (context: SessionContext): SavedSession =>
  savedSessionOf(context.state, {
    folders: readSavedFolders(context),
    savedSessionFiles: readSavedSessionFiles(context),
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
