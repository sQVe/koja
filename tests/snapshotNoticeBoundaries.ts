import type { ExecResult, FolderWatch } from 'herdr';

import type { SnapshotNoticeWrite } from './snapshotNoticeScenarios.ts';

const values = new Map<string, unknown>();

export const snapshotMessages: string[] = [];

export const snapshotWrites: SnapshotNoticeWrite[] = [];

// Herdr's mod log is console.log, so the child process captures that call instead of the module
// that writes it.
export const captureConsoleLog = (): void => {
  // eslint-disable-next-line no-console -- Herdr's mod log is console.log.
  console.log = (message: string): void => {
    snapshotMessages.push(message);
  };
};

export const seedShared = (key: string, value: unknown): void => {
  values.set(key, value);
};

export const clearShared = (key: string): void => {
  values.delete(key);
};

export const shared = (key: string): unknown => values.get(key);

export const setShared = (key: string, value: unknown): null => {
  snapshotWrites.push({ key, value, messageCount: snapshotMessages.length });
  values.set(key, value);

  return null;
};

export const checking = (): boolean => false;

export const exec = async (): Promise<ExecResult> => ({ code: 0, stdout: '', stderr: '' });

export const machines = (): [] => [];

export const panes = (): [] => [];

export const spaces = (): [] => [];

const neverSettles = (): void => undefined;

export const watchFolder = (): FolderWatch =>
  Object.assign(new Promise<string[]>(neverSettles), { cancel: (): void => undefined });
