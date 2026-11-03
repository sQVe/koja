import type { ExecResult } from 'herdr';

import { recordOf, stringOf } from '../../kit/fields.ts';

export type OverlayStatus = boolean | null;

type StatusExec = (command: string, args?: string[]) => Promise<ExecResult>;

export interface KeyboardHoldDeps {
  isFocused: () => boolean;
  overlayCloseCount: () => number;
  lookupStatus: () => Promise<OverlayStatus>;
  focus: () => void;
  now?: () => number;
}

export interface KeyboardHold {
  check: () => void;
  regain: () => void;
  yield: () => void;
  close: () => void;
}

const ownOverlays = new Set(['koja-modal', 'toast']);

const baseBackoffMilliseconds = 50;

const maxBackoffMilliseconds = 1000;

const overlayName = (overlay: unknown): string => {
  const record = recordOf(overlay);

  return stringOf(record['name']) ?? stringOf(overlay) ?? '';
};

const readOverlayStatus = (stdout: string): OverlayStatus => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }

  const status = recordOf(parsed);
  const overlays = status['overlays'];

  if (!Array.isArray(overlays)) {
    return null;
  }

  return overlays.some((overlay) => !ownOverlays.has(overlayName(overlay)));
};

export const createStatusLookup = (exec: StatusExec): (() => Promise<OverlayStatus>) => {
  return async (): Promise<OverlayStatus> => {
    const result = await exec('herdr-app', ['status']);

    if (result.code !== 0) {
      return null;
    }

    return readOverlayStatus(result.stdout);
  };
};

export const createKeyboardHold = (deps: KeyboardHoldDeps): KeyboardHold => {
  const now = deps.now ?? Date.now;

  let closed = false;
  let pending = false;
  let selfCaused = false;
  let seenCloseCount = deps.overlayCloseCount();
  let generation = 0;
  let backoff = 0;
  let nextLookupAt = 0;

  const resetBackoff = (): void => {
    backoff = 0;
    nextLookupAt = 0;
  };

  const trackOverlayCloses = (): void => {
    const closeCount = deps.overlayCloseCount();

    if (closeCount === seenCloseCount) {
      return;
    }

    seenCloseCount = closeCount;
    resetBackoff();
  };

  const backOff = (): void => {
    backoff =
      backoff === 0 ? baseBackoffMilliseconds : Math.min(backoff * 2, maxBackoffMilliseconds);

    nextLookupAt = now() + backoff;
  };

  const fail = (): void => {
    pending = false;
    backOff();
  };

  const applyStatus = (
    blocked: OverlayStatus,
    requestGeneration: number,
    confirmed: boolean,
  ): void => {
    pending = false;

    if (closed || requestGeneration !== generation) {
      return;
    }

    if (blocked === false) {
      if (!confirmed) {
        pending = true;

        void deps.lookupStatus().then((next) => {
          applyStatus(next, requestGeneration, true);
        }, fail);

        return;
      }

      resetBackoff();
      deps.focus();

      return;
    }

    backOff();
  };

  const check = (): void => {
    if (closed) {
      return;
    }

    trackOverlayCloses();

    if (deps.isFocused()) {
      selfCaused = false;
      resetBackoff();
      generation += 1;

      return;
    }

    if (selfCaused) {
      deps.focus();
      selfCaused = false;

      return;
    }

    if (pending || now() < nextLookupAt) {
      return;
    }

    pending = true;

    const requestGeneration = generation;

    void deps.lookupStatus().then((blocked) => {
      applyStatus(blocked, requestGeneration, false);
    }, fail);
  };

  return {
    check,
    regain: () => {
      generation += 1;
      selfCaused = true;
      resetBackoff();
    },
    yield: () => {
      selfCaused = false;
      generation += 1;
    },
    close: () => {
      closed = true;
    },
  };
};
