import { expect, it } from 'bun:test';

import { guardOutput } from './paneOutput.ts';

it('passes each chunk to the handler while nothing throws', () => {
  const seen: string[] = [];
  const failures: string[] = [];

  const guarded = guardOutput(
    (text: string) => seen.push(text),
    (message) => failures.push(message),
  );

  guarded('a');
  guarded('b');

  expect(seen).toEqual(['a', 'b']);
  expect(failures).toEqual([]);
});

it('reports the first error once and drops the chunks after it', () => {
  const seen: string[] = [];
  const failures: string[] = [];

  const guarded = guardOutput(
    (text: string) => {
      seen.push(text);

      if (text === 'bad') {
        throw new Error('output rejected');
      }
    },
    (message) => failures.push(message),
  );

  expect(() => {
    guarded('ok');
    guarded('bad');
    guarded('after');
    guarded('bad');
  }).not.toThrow();

  expect(seen).toEqual(['ok', 'bad']);
  expect(failures).toEqual(['output rejected']);
});

it('describes a thrown value that is not an error', () => {
  const failures: string[] = [];

  const guarded = guardOutput(
    () => {
      // oxlint-disable-next-line typescript/only-throw-error -- the guard must describe any thrown value.
      throw 'plain text';
    },
    (message) => failures.push(message),
  );

  guarded();

  expect(failures).toEqual(['plain text']);
});
