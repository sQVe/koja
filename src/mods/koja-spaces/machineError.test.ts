import { describe, expect, test } from 'bun:test';

import { machineErrorPlacement } from './machineError.ts';

const machinesError = 'Could not read machines.';

describe('machineErrorPlacement', () => {
  test('no error gives nothing', () => {
    expect(machineErrorPlacement(null, false)).toBeNull();
    expect(machineErrorPlacement(null, true)).toBeNull();
  });

  test('the rail gives a mark and the sidebar a line, both with the error text', () => {
    expect(machineErrorPlacement(machinesError, true)).toEqual({
      kind: 'mark',
      text: machinesError,
    });

    expect(machineErrorPlacement(machinesError, false)).toEqual({
      kind: 'line',
      text: machinesError,
    });
  });
});
