import { recordOf } from '../kit/fields.ts';
import { isPositiveWholeNumber } from './fields.ts';
import type { ReadShared } from './lease.ts';
import type { RecordNotices } from './recordNotices.ts';
import type { Snapshot } from './snapshot.ts';
import { parseSnapshot, snapshotKey, snapshotVersion } from './snapshot.ts';

const isNewerVersion = (version: unknown): boolean =>
  isPositiveWholeNumber(version) && version > snapshotVersion;

const isAbsent = (value: unknown): boolean => value === undefined || value === null;

export const readStoredSnapshot = (read: ReadShared, notices: RecordNotices): Snapshot | null => {
  const value = read(snapshotKey);
  const snapshot = parseSnapshot(value);

  if (snapshot !== null) {
    return snapshot;
  }

  if (isAbsent(value)) {
    return null;
  }

  const version = recordOf(value).version;

  if (version === 1) {
    return null;
  }

  if (isNewerVersion(version)) {
    notices.report('snapshot', 'newer');

    return null;
  }

  notices.report('snapshot', 'malformed');

  return null;
};
