import { afterAll, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

interface EmptyLine {
  kind: string;
}

await mock.module('gpui-base', () => gpuiBaseFake());

await mock.module('gpui-kit', () => gpuiKitFake());

await mock.module('herdr', () => herdrFake());

await mock.module('../../kit/index.ts', () => kitIndexFake());

const modulePath = './rows.ts';

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const { emptyLine } = (await import(modulePath)) as {
  emptyLine: (error: string | null, loading: boolean, root: string | null) => EmptyLine;
};

afterAll(() => {
  mock.restore();
});

describe('emptyLine', () => {
  test('a failed read asks for the error state', () => {
    expect(emptyLine('Could not read git status.', false, null).kind).toBe('error');
  });

  test('an error wins over a pending read', () => {
    expect(emptyLine('Could not read git status.', true, '/work/koja').kind).toBe('error');
  });

  test('a pending read asks for the loading state', () => {
    expect(emptyLine(null, true, null).kind).toBe('loading');
  });

  test('no data asks for the empty state', () => {
    expect(emptyLine(null, false, null).kind).toBe('empty');
  });
});
