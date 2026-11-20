import { recordOf } from '../kit/fields.ts';
import { isPositiveWholeNumber } from './fields.ts';
import type { ReadShared } from './lease.ts';
import type { Snapshot } from './snapshot.ts';
import { parseSnapshot, snapshotKey } from './snapshot.ts';

type SnapshotRejection = 'malformed' | 'newer';

export interface SnapshotNotices {
  report: (rejection: SnapshotRejection) => void;
}

const malformedNotice =
  'Koja ignored a malformed data snapshot. The data host will rebuild it on its next publish.';

const newerNotice =
  'Koja ignored a data snapshot from a newer version. Update Koja to a version that supports this snapshot format.';

const noticeOf: Record<SnapshotRejection, string> = {
  malformed: malformedNotice,
  newer: newerNotice,
};

const logSnapshotNotice = (message: string): void => {
  // eslint-disable-next-line no-console -- Herdr's mod log is console.log.
  console.log(message);
};

export const createSnapshotNotices = (log: (message: string) => void): SnapshotNotices => {
  const reported = new Set<SnapshotRejection>();

  return {
    report: (rejection) => {
      if (reported.has(rejection)) {
        return;
      }

      reported.add(rejection);
      log(noticeOf[rejection]);
    },
  };
};

// One reporter per loaded copy keeps each snapshot notice to one log line in its bundle.
export const snapshotNotices = createSnapshotNotices(logSnapshotNotice);

const isNewerVersion = (version: unknown): boolean => isPositiveWholeNumber(version) && version > 2;

const isAbsent = (value: unknown): boolean => value === undefined || value === null;

export const readStoredSnapshot = (read: ReadShared, notices: SnapshotNotices): Snapshot | null => {
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
    notices.report('newer');

    return null;
  }

  notices.report('malformed');

  return null;
};
