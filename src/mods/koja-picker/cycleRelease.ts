import type { PickerRow } from './rows.ts';

export type CycleRow = Pick<PickerRow, 'key' | 'kind'>;

export interface CycleRelease<Row extends CycleRow> {
  armRow: (rows: readonly Row[], index: number) => void;
  armed: () => boolean;
  disarm: () => void;
  releasedRow: (rows: readonly Row[]) => Row | undefined;
}

export const nextSpaceIndex = (rows: readonly CycleRow[], selectedKey: string | null): number => {
  const selectedIndex = Math.max(
    0,
    rows.findIndex((row) => row.key === selectedKey),
  );

  const afterSelected = rows.slice(selectedIndex + 1);
  const upToSelected = rows.slice(0, selectedIndex + 1);
  const ordered = [...afterSelected, ...upToSelected];

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
    armed: () => armedKey !== null,
    armRow: (rows, index) => {
      if (index === -1) {
        armedKey = null;

        return;
      }

      const row = rows[index];

      if (row === undefined) {
        throw new RangeError(`No row at index ${index}; the rows hold ${rows.length}`);
      }

      armedKey = row.key;
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
