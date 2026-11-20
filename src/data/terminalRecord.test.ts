import { describe, expect, test } from 'bun:test';

import { terminalMetadata } from './terminalRecord.ts';

const record = (address: string, labels: Record<string, unknown>): unknown => ({
  address,
  labels,
});

describe('terminalMetadata', () => {
  test('reads the first role and the last task for an address', () => {
    const records = [
      record('t1', { 'tau.role': 'lead', 'tau.task': 'First task' }),
      record('t1', { 'tau.role': 'worker', 'tau.task': 'Second task' }),
    ];

    const metadata = terminalMetadata(records).get('t1');

    expect(metadata).toEqual({
      role: 'lead',
      task: 'Second task',
    });
  });

  test('falls back to the profile and keeps a task when a later record has none', () => {
    const records = [
      record('t1', { 'tau.profile': 'qa', 'tau.task': 'Review' }),
      record('t1', { 'tau.role': 'checker' }),
    ];

    const metadata = terminalMetadata(records).get('t1');

    expect(metadata).toEqual({
      role: 'qa',
      task: 'Review',
    });
  });
});
