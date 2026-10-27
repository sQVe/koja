import { activeTabIdOf, shownView, viewedPane } from '../client/client.ts';
import type {
  ClipboardReadResult,
  PanePasteResult,
  PasteRequest,
  StoreSnapshot,
} from '../client/client.ts';
import type { PaneId, TabId, WorkspaceId } from '../ids.ts';
import type { ActionView } from './actionView.ts';
import { keyText } from './keyEncoding.ts';
import type { KeyEvent } from './keyEncoding.ts';

interface PanePasteHost {
  snapshot: () => StoreSnapshot;
  subscribe: (listener: () => void) => () => void;
  view: Pick<ActionView, 'getState' | 'subscribe'>;
  readClipboard: (signal: AbortSignal) => Promise<ClipboardReadResult>;
  paste: (request: PasteRequest) => Promise<PanePasteResult>;
}

export interface PanePaste {
  subscribe: (listener: () => void) => () => void;
  getStatus: () => string | undefined;
  fromClipboard: () => void;
  fromHost: (text: string) => boolean;
  takeKey: (event: KeyEvent) => boolean;
  close: () => void;
}

interface PasteTarget {
  paneId: PaneId;
  generation: number;
  workspaceId: WorkspaceId | undefined;
  tabId: TabId | undefined;
  live: boolean;
}

interface PromptStage {
  kind: 'prompt';
  text: string;
  authorization: string;
}

type Stage = { kind: 'reading'; abort: AbortController } | { kind: 'sending' } | PromptStage;

interface Attempt {
  target: PasteTarget;
  stage: Stage;
  unwatch: () => void;
}

type ReadFailure = Exclude<ClipboardReadResult, { ok: true }>['reason'];

type PasteFailure = Exclude<PanePasteResult, { ok: true }>['reason'];

const canceledNotice = 'Paste canceled.';

const changedNotice = 'Paste canceled: the pane changed.';

const noPaneNotice = 'Nothing pasted: no pane is shown.';

const readNotices: Record<ReadFailure, string> = {
  unsupported: 'Paste failed: no clipboard is available here.',
  empty: 'Nothing pasted: the clipboard is empty.',
  failed: 'Paste failed: the clipboard could not be read.',
  timeout: 'Paste failed: the clipboard read timed out.',
  aborted: canceledNotice,
};

const pasteNotices: Record<Exclude<PasteFailure, 'confirmationRequired'>, string> = {
  paneMissing: 'Paste failed: the pane is gone.',
  paneReplaced: 'Paste failed: the pane restarted.',
  authorizationMismatch: 'Paste failed: the confirmation no longer matches.',
  noServer: 'Paste failed: the server did not answer.',
  connectionFailed: 'Paste failed: the server did not answer.',
  refused: 'Paste failed: the server did not answer.',
};

const promptOf = (lines: number): string => {
  const noun = lines === 1 ? 'line' : 'lines';

  return `y/n: paste ${lines} ${noun} without bracketed paste?`;
};

const isMultiline = (text: string): boolean => /[\r\n]/.test(text);

const livePhases: ReadonlySet<string> = new Set(['starting', 'running']);

const targetOf = (snapshot: StoreSnapshot): PasteTarget | undefined => {
  const pane = viewedPane(snapshot);

  if (pane === undefined) {
    return undefined;
  }

  const view = shownView(snapshot);
  const workspaceId = view.focusedWorkspaceId;

  return {
    paneId: pane.id,
    generation: pane.generation,
    workspaceId,
    tabId: activeTabIdOf(view, workspaceId),
    live: livePhases.has(pane.lifecycle),
  };
};

const samePane = (bound: PasteTarget, shown: PasteTarget): boolean =>
  bound.paneId === shown.paneId && bound.generation === shown.generation;

const samePlace = (bound: PasteTarget, shown: PasteTarget): boolean =>
  bound.workspaceId === shown.workspaceId && bound.tabId === shown.tabId;

const sameTarget = (bound: PasteTarget, shown: PasteTarget | undefined): boolean =>
  shown?.live === true && samePane(bound, shown) && samePlace(bound, shown);

export const createPanePaste = (host: PanePasteHost): PanePaste => {
  const listeners = new Set<() => void>();
  let status: string | undefined;
  let current: Attempt | undefined;

  const setStatus = (next: string | undefined): void => {
    status = next;

    for (const listener of listeners) {
      listener();
    }
  };

  const isBound = (target: PasteTarget): boolean => {
    const shown = targetOf(host.snapshot());
    const viewClosed = host.view.getState().kind === 'closed';

    return viewClosed && sameTarget(target, shown);
  };

  const stop = (attempt: Attempt): void => {
    attempt.unwatch();

    if (attempt.stage.kind === 'reading') {
      attempt.stage.abort.abort();
    }

    if (current === attempt) {
      current = undefined;
    }
  };

  const finish = (attempt: Attempt, notice: string | undefined): void => {
    stop(attempt);
    setStatus(notice);
  };

  const watch = (attempt: Attempt): (() => void) => {
    const check = (): void => {
      const waiting = current === attempt && attempt.stage.kind !== 'sending';

      if (waiting && !isBound(attempt.target)) {
        finish(attempt, changedNotice);
      }
    };

    const stopStore = host.subscribe(check);
    const stopView = host.view.subscribe(check);

    return () => {
      stopStore();
      stopView();
    };
  };

  const begin = (target: PasteTarget, stage: Stage): Attempt => {
    const attempt: Attempt = { target, stage, unwatch: () => undefined };

    current = attempt;
    attempt.unwatch = watch(attempt);

    return attempt;
  };

  const interrupt = (): void => {
    if (current !== undefined) {
      stop(current);
    }

    setStatus(undefined);
  };

  const pasteSettled = (attempt: Attempt, text: string, result: PanePasteResult): void => {
    if (current !== attempt) {
      return;
    }

    if (result.ok) {
      finish(attempt, undefined);

      return;
    }

    if (result.reason !== 'confirmationRequired') {
      finish(attempt, pasteNotices[result.reason]);

      return;
    }

    if (!isBound(attempt.target)) {
      finish(attempt, changedNotice);

      return;
    }

    attempt.stage = { kind: 'prompt', text, authorization: result.authorization };
    setStatus(promptOf(result.lines));
  };

  const send = (attempt: Attempt, text: string, authorization: string | undefined): void => {
    attempt.stage = { kind: 'sending' };

    const request = {
      pane: attempt.target.paneId,
      generation: attempt.target.generation,
      text,
      authorization,
    };

    host
      .paste(request)
      .then((result) => {
        pasteSettled(attempt, text, result);
      })
      .catch(() => {
        pasteSettled(attempt, text, { ok: false, reason: 'connectionFailed' });
      });
  };

  const readSettled = (attempt: Attempt, result: ClipboardReadResult): void => {
    if (current !== attempt) {
      return;
    }

    if (!result.ok) {
      finish(attempt, readNotices[result.reason]);

      return;
    }

    if (!isBound(attempt.target)) {
      finish(attempt, changedNotice);

      return;
    }

    send(attempt, result.text, undefined);
  };

  const answerPrompt = (attempt: Attempt, prompt: PromptStage, event: KeyEvent): void => {
    if (keyText(event) !== 'y') {
      finish(attempt, canceledNotice);

      return;
    }

    setStatus(undefined);
    send(attempt, prompt.text, prompt.authorization);
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    getStatus: () => status,
    fromClipboard: () => {
      interrupt();

      const target = targetOf(host.snapshot());

      if (target?.live !== true) {
        return;
      }

      const abort = new AbortController();
      const attempt = begin(target, { kind: 'reading', abort });

      host
        .readClipboard(abort.signal)
        .then((result) => {
          readSettled(attempt, result);
        })
        .catch(() => {
          readSettled(attempt, { ok: false, reason: 'failed' });
        });
    },
    fromHost: (text) => {
      interrupt();

      if (!isMultiline(text)) {
        return false;
      }

      const target = targetOf(host.snapshot());

      if (target === undefined) {
        setStatus(noPaneNotice);

        return true;
      }

      send(begin(target, { kind: 'sending' }), text, undefined);

      return true;
    },
    takeKey: (event) => {
      const attempt = current;
      const pressed = event.kind !== 'release';

      if (attempt?.stage.kind !== 'prompt') {
        if (pressed) {
          setStatus(undefined);
        }

        return false;
      }

      if (pressed) {
        answerPrompt(attempt, attempt.stage, event);
      }

      return true;
    },
    close: interrupt,
  };
};
