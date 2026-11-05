import { describe, expect, test } from 'bun:test';

import { canCommit } from './commit.ts';
import type { ChangesSnapshot } from './git.ts';
import { applyRead, emptyReadState, isStale, readStateLine, watchStateLine } from './readState.ts';
import type { ReadState } from './readState.ts';
import type { ChangeFile } from './status.ts';

const file: ChangeFile = {
  path: 'src/kit/size.ts',
  status: 'M',
  fresh: false,
  add: 3,
  del: 1,
  binary: false,
};

const snapshot = (root: string, files: ChangeFile[] = [file]): ChangesSnapshot => ({
  root,
  on: null,
  hasHead: true,
  files,
  limited: false,
});

const good = (state: ReadState, root: string, now: number): ReadState =>
  applyRead(state, { snapshot: snapshot(root) }, now);

const request = {
  message: 'Fix the login redirect',
  busy: false,
  loading: false,
  contextCurrent: true,
  stale: false,
};

describe('applyRead', () => {
  test('a good read keeps its files and its read time', () => {
    const state = good(emptyReadState(), '/work/koja', 1000);

    expect(state.lastGood?.snapshot.files).toEqual([file]);
    expect(state.lastGood?.readAt).toBe(1000);
    expect(state.failure).toBeNull();
  });

  test('a failed refresh keeps the old files and their read time', () => {
    const failed = applyRead(
      good(emptyReadState(), '/work/koja', 1000),
      { failure: 'offline' },
      1240,
    );

    expect(failed.lastGood?.snapshot.files).toEqual([file]);
    expect(failed.lastGood?.readAt).toBe(1000);
    expect(failed.failure).toBe('offline');
  });

  test('a good read after a failure clears the failure', () => {
    const failed = applyRead(
      good(emptyReadState(), '/work/koja', 1000),
      { failure: 'offline' },
      1240,
    );

    expect(good(failed, '/work/koja', 1300).failure).toBeNull();
  });

  test('a later good read for the same repository enables Commit again', () => {
    const failed = applyRead(
      good(emptyReadState(), '/work/koja', 1000),
      { failure: 'offline' },
      1240,
    );

    const recovered = good(failed, '/work/koja', 1300);

    expect(canCommit({ ...request, stale: isStale(recovered) })).toBe(true);
  });
});

describe('isStale', () => {
  test('a good read is not stale', () => {
    expect(isStale(good(emptyReadState(), '/work/koja', 1000))).toBe(false);
  });

  test('a failed refresh over old files is stale', () => {
    const failed = applyRead(
      good(emptyReadState(), '/work/koja', 1000),
      { failure: 'offline' },
      1240,
    );

    expect(isStale(failed)).toBe(true);
  });

  test('a failed first read is stale', () => {
    expect(isStale(applyRead(emptyReadState(), { failure: 'offline' }, 1000))).toBe(true);
  });

  test('no folder is stale', () => {
    expect(isStale(emptyReadState())).toBe(true);
  });

  test('a watch failure alone is not stale', () => {
    const state = { ...good(emptyReadState(), '/work/koja', 1000), watchFailed: true };

    expect(isStale(state)).toBe(false);
  });

  test('a watch failure alone leaves Commit allowed', () => {
    const state = { ...good(emptyReadState(), '/work/koja', 1000), watchFailed: true };

    expect(canCommit({ ...request, stale: isStale(state) })).toBe(true);
  });
});

describe('readStateLine', () => {
  test('a failed refresh shows the old files age and names the repository', () => {
    const failed = applyRead(
      good(emptyReadState(), '/work/koja', 1000),
      { failure: 'offline' },
      1240,
    );

    expect(readStateLine(failed, false, 1240)).toEqual({
      kind: 'error',
      text: 'Showing changes from 4m ago. Could not refresh koja.',
    });
  });

  test('a failed refresh within a minute of the last good read says just now', () => {
    const failed = applyRead(
      good(emptyReadState(), '/work/koja', 1000),
      { failure: 'offline' },
      1010,
    );

    expect(readStateLine(failed, false, 1010)?.text).toBe(
      'Showing changes from just now. Could not refresh koja.',
    );
  });

  test('a failed first read shows its error and no files', () => {
    const failed = applyRead(emptyReadState(), { failure: 'Not a git repository' }, 1000);

    expect(failed.lastGood).toBeNull();

    expect(readStateLine(failed, false, 1000)).toEqual({
      kind: 'error',
      text: 'Not a git repository',
    });
  });

  test('a failure wins over a pending read', () => {
    const failed = applyRead(emptyReadState(), { failure: 'Not a git repository' }, 1000);

    expect(readStateLine(failed, true, 1000)?.kind).toBe('error');
  });

  test('a pending read asks for the loading state', () => {
    expect(readStateLine(emptyReadState(), true, 1000)?.kind).toBe('loading');
  });

  test('no folder asks for the empty state', () => {
    expect(readStateLine(emptyReadState(), false, 1000)?.kind).toBe('empty');
  });

  test('a repository with no changes asks for the empty state', () => {
    const state = applyRead(emptyReadState(), { snapshot: snapshot('/work/koja', []) }, 1000);

    expect(readStateLine(state, false, 1000)?.kind).toBe('empty');
  });

  test('a current list with files needs no line', () => {
    expect(readStateLine(good(emptyReadState(), '/work/koja', 1000), false, 1000)).toBeNull();
  });
});

describe('watchStateLine', () => {
  test('a watch failure shows its own error line', () => {
    const state = { ...good(emptyReadState(), '/work/koja', 1000), watchFailed: true };

    expect(watchStateLine(state)).toEqual({
      kind: 'error',
      text: 'Could not watch koja for changes.',
    });
  });

  test('a working watch needs no line', () => {
    expect(watchStateLine(good(emptyReadState(), '/work/koja', 1000))).toBeNull();
  });

  test('a watch failure without a snapshot needs no line', () => {
    expect(watchStateLine({ ...emptyReadState(), watchFailed: true })).toBeNull();
  });
});
