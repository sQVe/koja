import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program } from 'herdr';

import { paneName } from '../../kit/paneLabel.ts';
import { paneRole } from './paneRole.ts';

const pi: Program = {
  key: 'pi',
  name: 'Pi',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: false,
  agent: true,
};

const paneOf = (terminal: string | null): PaneInfo => ({
  pane: 'p1',
  terminal,
  tab: 'tb1',
  title: 'Pi',
  cwd: null,
  branch: null,
  status: null,
  app: null,
  program: pi,
  focused: false,
  zoomed: false,
  movable: true,
});

const terminalRecord = (address: string, labels: Record<string, unknown>): unknown => ({
  address,
  labels,
});

describe('paneRole', () => {
  test('a tau.role label names the role', () => {
    const records = [terminalRecord('t1', { 'tau.role': 'architect', 'tau.profile': 'worker' })];

    expect(paneRole('t1', records)).toBe('architect');
  });

  test('a tau.profile label names the profile without a role', () => {
    const records = [terminalRecord('t1', { 'tau.profile': 'scout' })];

    expect(paneRole('t1', records)).toBe('scout');
  });

  test('a pane without either label has no role', () => {
    const records = [terminalRecord('t1', {})];
    const pane = paneOf('t1');

    expect(paneRole('t1', records)).toBeNull();
    expect(paneName(pane)).toBe('Pi');
  });

  test('an empty role falls back to the profile', () => {
    const records = [terminalRecord('t1', { 'tau.role': '', 'tau.profile': 'qa' })];

    expect(paneRole('t1', records)).toBe('qa');
  });

  test('the first record for an address names the role', () => {
    const records = [
      terminalRecord('t1', { 'tau.role': 'lead' }),
      terminalRecord('t1', { 'tau.role': 'worker' }),
    ];

    expect(paneRole('t1', records)).toBe('lead');
  });

  test('a nonmatching or malformed record has no role', () => {
    const records = [
      'not a record',
      terminalRecord('t2', { 'tau.role': 'lead' }),
      { address: 't1', labels: 'not labels' },
    ];

    expect(paneRole('t1', records)).toBeNull();
  });
});
