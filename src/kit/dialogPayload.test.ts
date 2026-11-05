import { describe, expect, test } from 'bun:test';

import { readDialogCommand } from './dialogPayload.ts';

describe('readDialogCommand', () => {
  test('a payload with no command name reads as an empty name', () => {
    expect(readDialogCommand({ args: { id: 's1' } })).toEqual({ name: '', args: { id: 's1' } });
  });
});
