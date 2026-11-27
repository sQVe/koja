import { describe, expect, test } from 'bun:test';

import { seededRandom } from '../../../tests/seeded.ts';
import type { CycleRow } from './cycleRelease.ts';
import { createCycleRelease, nextSpaceIndex } from './cycleRelease.ts';

const rowOf = (key: string, kind: CycleRow['kind']): CycleRow => ({ key, kind });

const rows: CycleRow[] = [
  rowOf('space:a', 'space'),
  rowOf('tab:t', 'tab'),
  rowOf('space:b', 'space'),
];

describe('nextSpaceIndex', () => {
  test('answers the space after the first row when no row is selected', () => {
    expect(nextSpaceIndex(rows, null)).toBe(2);
  });

  test('answers the space after the first row when the selected key is missing', () => {
    expect(nextSpaceIndex(rows, 'space:gone')).toBe(2);
  });

  test('answers -1 for empty rows', () => {
    expect(nextSpaceIndex([], null)).toBe(-1);
  });
});

describe('cycle release', () => {
  test('arming the row before the first disarms', () => {
    const cycle = createCycleRelease<CycleRow>();

    cycle.armRow(rows, 0);
    cycle.armRow(rows, -1);

    expect(cycle.releasedRow(rows)).toBeUndefined();
  });

  test('a cycle that wraps to the selected space still arms it', () => {
    const wrapped = [rowOf('space:a', 'space'), rowOf('tab:t', 'tab')];
    const cycle = createCycleRelease<CycleRow>();

    const index = nextSpaceIndex(wrapped, 'space:a');

    cycle.armRow(wrapped, index);

    expect(cycle.releasedRow(wrapped)).toEqual(rowOf('space:a', 'space'));
  });

  test('answers the armed row once', () => {
    const cycle = createCycleRelease<CycleRow>();

    cycle.armRow(rows, 1);

    expect(cycle.releasedRow(rows)).toEqual(rowOf('tab:t', 'tab'));
    expect(cycle.releasedRow(rows)).toBeUndefined();
  });

  test('answers nothing after a disarm', () => {
    const cycle = createCycleRelease<CycleRow>();

    cycle.armRow(rows, 1);
    cycle.disarm();

    expect(cycle.releasedRow(rows)).toBeUndefined();
  });

  test('answers nothing when the armed row left the rows', () => {
    const cycle = createCycleRelease<CycleRow>();

    cycle.armRow(rows, 1);

    expect(
      cycle.releasedRow([rowOf('space:a', 'space'), rowOf('space:b', 'space')]),
    ).toBeUndefined();
  });

  test('a release answers a row at most once per arm', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const random = seededRandom(seed);
      const cycle = createCycleRelease<CycleRow>();

      let answeredSinceArm = false;

      for (let step = 0; step < 40; step += 1) {
        const action = Math.floor(random() * 3);

        if (action === 0) {
          const index = Math.floor(random() * (rows.length + 1)) - 1;

          cycle.armRow(rows, index);
          answeredSinceArm = false;
        } else if (action === 1) {
          cycle.disarm();
        } else {
          const released = cycle.releasedRow(rows);
          const answersTwice = released !== undefined && answeredSinceArm;

          expect(answersTwice, `seed ${seed}: one arm answered two releases`).toBe(false);
          answeredSinceArm = answeredSinceArm || released !== undefined;
        }
      }
    }
  });
});
