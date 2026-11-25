import { describe, expect, test } from 'bun:test';

import { pullFacts } from '../../tests/pullFacts.ts';
import { pullNeeds } from './pullNeeds.ts';
import type { Pull } from './pulls.ts';

const readyPull = (fields: Partial<Pull> = {}): Pull =>
  pullFacts({
    number: 1,
    headRefName: 'main',
    mergeable: 'mergeable',
    mergeState: 'clean',
    review: 'approved',
    checks: { kind: 'read', value: 'passing' },
    threads: { kind: 'read', value: { unresolved: 0, complete: true } },
    ...fields,
  });

describe('pullNeeds', () => {
  test('maps failing checks and an unresolved thread to failing and review', () => {
    const pull = readyPull({
      mergeState: 'blocked',
      review: 'reviewRequired',
      checks: { kind: 'read', value: 'failing' },
      threads: { kind: 'read', value: { unresolved: 1, complete: true } },
    });

    expect(pullNeeds(pull)).toEqual(['failing', 'review']);
  });

  test('maps a clean, approved, passing PR to ready', () => {
    expect(pullNeeds(readyPull())).toEqual(['ready']);
  });

  test('asks for review on requested changes even with resolved threads', () => {
    const pull = readyPull({
      review: 'changesRequested',
      threads: { kind: 'read', value: { unresolved: 0, complete: true } },
    });

    expect(pullNeeds(pull)).toEqual(['review']);
  });

  test('reports no needs for a pull blocked only by a required review', () => {
    const pull = readyPull({ mergeState: 'blocked', review: 'reviewRequired' });

    expect(pullNeeds(pull)).toEqual([]);
  });

  test('maps a conflicting PR to conflict and not ready', () => {
    const pull = readyPull({ mergeable: 'conflicting', mergeState: 'dirty' });

    expect(pullNeeds(pull)).toEqual(['conflict']);
  });

  test('never makes unknown mergeability ready', () => {
    expect(pullNeeds(readyPull({ mergeable: 'unknown', mergeState: 'unknown' }))).toEqual([]);
  });

  test('gives a draft or a merged PR no needs', () => {
    const failing = {
      checks: { kind: 'read', value: 'failing' },
      threads: { kind: 'read', value: { unresolved: 2, complete: false } },
    } satisfies Partial<Pull>;

    expect(pullNeeds(readyPull({ isDraft: true, ...failing }))).toEqual([]);
    expect(pullNeeds(readyPull({ state: 'MERGED', ...failing }))).toEqual([]);
  });

  test('keeps a failed part last value but never calls it ready', () => {
    const threadsFailed = readyPull({
      threads: { kind: 'failed', last: { unresolved: 0, complete: true } },
    });

    const checksFailed = readyPull({ checks: { kind: 'failed', last: 'failing' } });

    expect(pullNeeds(threadsFailed)).toEqual([]);
    expect(pullNeeds(checksFailed)).toEqual(['failing']);
  });
});
