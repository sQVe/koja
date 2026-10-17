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

it('splits a word longer than the width into full lines', async () => {
  const frame = await drawFailedPane('abcdefghij', 4, 4);

  expect(frame.split('\n').map((line) => line.trimEnd())).toEqual(['abcd', 'efgh', 'ij', '', '']);
});

it('fills a line exactly to the pane width before it wraps', async () => {
  const frame = await drawFailedPane('abc def ghi', 7, 3);

  expect(frame.split('\n').map((line) => line.trimEnd())).toEqual(['abc def', 'ghi', '', '']);
});

it('collapses a double space into one', async () => {
  const frame = await drawFailedPane('a  b', 10, 1);

  expect(frame.split('\n')[0]?.trimEnd()).toBe('a b');
});

it('moves and resizes with the layout', async () => {
  const created = await createTestRenderer({ width: 12, height: 5 });

  const pane = new FailedPaneRenderable(created.renderer, {
    message: 'abc def ghi',
    width: 12,
    height: 1,
    left: 0,
    top: 0,
  });

  setup = created;
  created.renderer.root.add(pane);
  pane.move(2, 2);
  pane.resize(5, 3);
  await created.renderOnce();

  expect(
    created
      .captureCharFrame()
      .split('\n')
      .map((line) => line.trimEnd()),
  ).toEqual(['', '', '  abc', '  def', '  ghi', '']);
});
