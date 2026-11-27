import type { PickerRow } from './rows.ts';

export type CycleRow = Pick<PickerRow, 'key' | 'kind'>;

export interface CycleRelease<Row extends CycleRow> {
  armRow: (rows: readonly Row[], index: number) => void;
  disarm: () => void;
  releasedRow: (rows: readonly Row[]) => Row | undefined;
}

export const nextSpaceIndex = (rows: readonly CycleRow[], selectedKey: string | null): number => {
  const selected = Math.max(
    0,
    rows.findIndex((row) => row.key === selectedKey),
  );

  const ordered = [...rows.slice(selected + 1), ...rows.slice(0, selected + 1)];
  const nextSpace = ordered.find((row) => row.kind === 'space');

  return nextSpace === undefined ? -1 : rows.indexOf(nextSpace);
};

export const createCycleRelease = <Row extends CycleRow>(): CycleRelease<Row> => {
  let armedKey: string | null = null;

  const releaseKey = (): string | null => {
    const key = armedKey;

    armedKey = null;

    return key;
  };

  return {
    armRow: (rows, index) => {
      armedKey = index === -1 ? null : (rows[index]?.key ?? null);
    },
    disarm: () => {
      armedKey = null;
    },
    releasedRow: (rows) => {
      const key = releaseKey();

      if (key === null) {
        return undefined;
      }

      return rows.find((row) => row.key === key);
    },
  };
};
