type RecordName = 'snapshot' | 'pullReadTimes' | 'pullRetryRequests' | 'pullRetryOutcomes';

export type RecordRejection = 'malformed' | 'newer';

export interface RecordNotices {
  report: (record: RecordName, rejection: RecordRejection) => void;
}

const messages: Record<RecordName, Record<RecordRejection, string>> = {
  snapshot: {
    malformed:
      'Koja ignored a malformed data snapshot. The data host will rebuild it on its next publish.',
    newer:
      'Koja ignored a data snapshot from a newer version. Update Koja to a version that supports this snapshot format.',
  },
  pullReadTimes: {
    malformed:
      'Koja ignored malformed PR read times. The data host rewrites them after its next PR read.',
    newer:
      'Koja ignored PR read times from a newer version. Update Koja to a version that supports this format.',
  },
  pullRetryRequests: {
    malformed: 'Koja ignored malformed PR Retry requests. Click Retry again.',
    newer:
      'Koja ignored PR Retry requests from a newer version. Update Koja to a version that supports this format.',
  },
  pullRetryOutcomes: {
    malformed: 'Koja ignored malformed PR Retry outcomes. Click Retry again.',
    newer:
      'Koja ignored PR Retry outcomes from a newer version. Update Koja to a version that supports this format.',
  },
};

const logRecordNotice = (message: string): void => {
  // eslint-disable-next-line no-console -- Herdr's mod log is console.log.
  console.log(message);
};

export const createRecordNotices = (log: (message: string) => void): RecordNotices => {
  const reported = new Set<string>();

  return {
    report: (record, rejection) => {
      const key = `${record}:${rejection}`;

      if (reported.has(key)) {
        return;
      }

      reported.add(key);
      log(messages[record][rejection]);
    },
  };
};

export const recordNotices = createRecordNotices(logRecordNotice);
