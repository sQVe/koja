import { afterEach, expect, it } from 'bun:test';

import { createTestRenderer } from '@opentui/core/testing';
import type { TestRendererSetup } from '@opentui/core/testing';

import { FailedPaneRenderable } from './paneFailure.ts';

let setup: TestRendererSetup | undefined;

afterEach(() => {
  setup?.renderer.destroy();
  setup = undefined;
});

const drawFailedPane = async (message: string, width: number, height: number): Promise<string> => {
  const created = await createTestRenderer({ width, height });

  setup = created;

  created.renderer.root.add(
    new FailedPaneRenderable(created.renderer, { message, width, height, left: 0, top: 0 }),
  );

  await created.renderOnce();

  return created.captureCharFrame();
};

it('draws the error of a failed pane in its cells', async () => {
  const frame = await drawFailedPane('Cannot start /bin/missing', 40, 2);

  expect(frame.split('\n')[0]?.trimEnd()).toBe('Cannot start /bin/missing');
});

it('wraps a long error inside the pane width', async () => {
  const frame = await drawFailedPane('Saved folder /tmp/gone is unavailable.', 16, 4);

  expect(frame.split('\n').map((line) => line.trimEnd())).toEqual([
    'Saved folder',
    '/tmp/gone is',
    'unavailable.',
    '',
    '',
  ]);
});
