import type { PaneInfo } from 'herdr';
import { focused, panes, spaces } from 'herdr';

export interface Location {
  cwd: string | null;
  on: string | null;
}

const present = (value: string | null | undefined): value is string => Boolean(value);

const paneFor = (paneId: string | null | undefined): PaneInfo | null => {
  if (paneId === null || paneId === undefined) {
    return null;
  }

  return panes().find((candidate) => candidate.pane === paneId) ?? null;
};

const remoteFor = (terminal: string | null): string | null => {
  if (terminal?.includes('/') !== true) {
    return null;
  }

  return terminal.split('/')[0] ?? null;
};

export const location = (): Location => {
  const activeSpace = spaces().find((space) => space.active);
  const current = focused();
  const pane = paneFor(current?.pane);
  const terminal = current?.terminal ?? null;

  const on = current?.pane === null ? remoteFor(terminal) : (activeSpace?.machine ?? null);

  const cwd = [pane?.cwd, current?.cwd, activeSpace?.folder].find(present) ?? null;

  return { cwd, on };
};

export const locationKey = (): string => JSON.stringify(location());
