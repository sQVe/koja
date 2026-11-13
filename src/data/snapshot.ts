import { isRecord, recordOf } from '../kit/fields.ts';
import { isPositiveWholeNumber } from './fields.ts';

export type Facts = Record<string, never>;

export interface Snapshot {
  version: 1;
  revision: number;
  facts: Facts;
}

export const snapshotKey = 'koja.data.v1.snapshot';

const isEmptyRecord = (value: unknown): value is Facts =>
  isRecord(value) && Object.keys(value).length === 0;

export const parseSnapshot = (value: unknown): Snapshot | null => {
  const fields = recordOf(value);

  if (fields.version !== 1) {
    return null;
  }

  if (!isPositiveWholeNumber(fields.revision)) {
    return null;
  }

  if (!isEmptyRecord(fields.facts)) {
    return null;
  }

  return { version: 1, revision: fields.revision, facts: {} };
};
