import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import type { PaneRuntime } from './pane.ts';
import type { PaneEffectContext } from './paneEffects.ts';
import { releasePane } from './paneEffects.ts';
import type { RunningPane } from './paneRecord.ts';
import type { RowPublisher } from './rowPublisher.ts';

interface Fixture {
  context: PaneEffectContext;
  running: RunningPane;
  disposed: string[];
  errors: string[];
}

const id = paneId(1);

const fixture = (generation: number, failing = false): Fixture => {
  const disposed: string[] = [];
  const errors: string[] = [];

  const runtime = {
    generation,
    [Symbol.dispose]: () => {
      disposed.push('runtime');

      if (failing) {
        throw new Error('No /proc here.');
      }
    },
  } as unknown as PaneRuntime;

  const publisher = {
    [Symbol.dispose]: () => {
      disposed.push('publisher');

      if (failing) {
        throw new Error('publisher broke');
      }
    },
  } as unknown as RowPublisher;

  const running: RunningPane = {
    runtime,
    publication: { publisher, pending: false },
  };

  const context = {
    options: {
      log: {
        error: (message: string) => {
          errors.push(message);
        },
      },
    },
    runtime: { panes: new Map([[id, running]]) },
  } as unknown as PaneEffectContext;

  return { context, running, disposed, errors };
};

it('leaves the record of the current generation when an older generation is released', () => {
  const { context, running, disposed } = fixture(2);

  releasePane(context, id, 1);

  expect(context.runtime.panes.get(id)).toBe(running);
  expect(disposed).toEqual([]);
});

it('disposes and removes the record of the released generation', () => {
  const { context, disposed } = fixture(2);

  releasePane(context, id, 2);

  expect(context.runtime.panes.has(id)).toBe(false);
  expect(disposed).toEqual(['publisher', 'runtime']);
});

it('runs every release step and logs each failure without throwing', () => {
  const { context, disposed, errors } = fixture(2, true);

  expect(() => {
    releasePane(context, id, 2);
  }).not.toThrow();

  expect(context.runtime.panes.has(id)).toBe(false);
  expect(disposed).toEqual(['publisher', 'runtime']);
  expect(errors).toHaveLength(2);
});
