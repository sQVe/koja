import type { ExecResult } from 'herdr';

import { listOf, recordOf, stringOf } from '../../kit/fields.ts';

export type OverlayStatus = boolean | null;

type StatusExec = (command: string, args?: string[]) => Promise<ExecResult>;

export interface KeyboardHoldDeps {
  isFocused: () => boolean;
  lookupStatus: () => Promise<OverlayStatus>;
  focus: () => void;
}

export interface KeyboardHold {
  check: () => void;
  close: () => void;
}

const ownOverlays = new Set(['koja-modal']);

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
  const overlays = listOf(status['overlays']);

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
  let pending = false;
  let closed = false;

  const settle = (blocked: OverlayStatus): void => {
    pending = false;

    if (closed) {
      return;
    }

    if (blocked === false) {
      deps.focus();
    }
  };

  const fail = (): void => {
    pending = false;
  };

  const check = (): void => {
    if (closed || pending || deps.isFocused()) {
      return;
    }

    pending = true;
    void deps.lookupStatus().then(settle, fail);
  };

  return {
    check,
    close: () => {
      closed = true;
    },
  };
};
