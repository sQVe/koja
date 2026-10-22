import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { createInputHarness, nextTick } from './inputFixtures.ts';

it('sends a drag and the release to the pane where the press started', () => {
  const { toPane, mouse } = createInputHarness();

  mouse(0, 6, 3, 'M');
  mouse(32, 16, 3, 'M');
  mouse(0, 16, 3, 'm');

  expect(toPane).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3M' },
    { pane: paneId(1), text: '\x1b[<32;10;3M' },
    { pane: paneId(1), text: '\x1b[<0;10;3m' },
  ]);
});

it('sends a click to the pane under the pointer after a release', () => {
  const { toPane, mouse } = createInputHarness();

  mouse(0, 6, 3, 'M');
  mouse(0, 6, 3, 'm');
  mouse(0, 16, 3, 'M');

  expect(toPane.map((entry) => entry.pane)).toEqual([paneId(1), paneId(1), paneId(2)]);
});

it('sends nothing for a press outside every pane or the drag that follows it', () => {
  const { toPane, mouse } = createInputHarness();

  mouse(0, 40, 3, 'M');
  mouse(32, 6, 3, 'M');
  mouse(0, 6, 3, 'm');

  expect(toPane).toEqual([]);
});

it('keeps the input mode and the key order when a mouse report arrives between keys', () => {
  const { toPane, mouse, mode, press } = createInputHarness();

  press('\x02');
  mouse(0, 6, 3, 'M');

  expect(mode()).toBe('normal');
  expect(toPane.map((entry) => entry.pane)).toEqual([paneId(1)]);
});

it('keeps the first press capture while another button presses and releases elsewhere', () => {
  const { toPane, mouse } = createInputHarness();

  mouse(0, 6, 3, 'M');
  mouse(2, 16, 3, 'M');
  mouse(2, 16, 3, 'm');
  mouse(0, 16, 3, 'm');

  expect(toPane).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3M' },
    { pane: paneId(1), text: '\x1b[<0;10;3m' },
  ]);
});

it('captures a new press after the release of the first', () => {
  const { toPane, mouse } = createInputHarness();

  mouse(0, 6, 3, 'M');
  mouse(0, 6, 3, 'm');
  mouse(2, 16, 3, 'M');
  mouse(2, 16, 3, 'm');

  expect(toPane.map((entry) => entry.pane)).toEqual([paneId(1), paneId(1), paneId(2), paneId(2)]);
});

it('sends the release to the captured pane at its last cell once the pane is not placed', () => {
  const { toPane, mouse, gone } = createInputHarness();

  mouse(0, 6, 3, 'M');
  mouse(32, 8, 4, 'M');
  gone.unplaced.add(paneId(1));
  mouse(32, 16, 5, 'M');
  mouse(0, 16, 5, 'm');

  expect(toPane).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3M' },
    { pane: paneId(1), text: '\x1b[<32;8;4M' },
    { pane: paneId(1), text: '\x1b[<0;8;4m' },
  ]);
});

it('sends nothing and clears the capture when the captured pane no longer exists', () => {
  const { toPane, mouse, gone } = createInputHarness();

  mouse(0, 6, 3, 'M');
  gone.unplaced.add(paneId(1));
  gone.missing.add(paneId(1));
  mouse(0, 6, 3, 'm');
  mouse(0, 16, 3, 'M');

  expect(toPane.map((entry) => entry.pane)).toEqual([paneId(1), paneId(2)]);
});

it('keeps the release for the captured pane when a wheel turns over another pane', () => {
  const { toPane, mouse, gone } = createInputHarness();

  mouse(0, 6, 3, 'M');
  mouse(64, 16, 4, 'M');
  gone.unplaced.add(paneId(1));
  mouse(0, 16, 4, 'm');

  expect(toPane.filter((entry) => entry.text.endsWith('m'))).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3m' },
  ]);
});

it('clamps the release cell to the size the hidden pane has now', () => {
  const { toPane, mouse, gone } = createInputHarness();

  mouse(0, 9, 8, 'M');
  gone.unplaced.add(paneId(1));
  gone.sizes.set(paneId(1), { columns: 4, rows: 5 });
  mouse(0, 16, 4, 'm');

  expect(toPane.at(-1)).toEqual({ pane: paneId(1), text: '\x1b[<0;4;5m' });
});

it('uses the current placement when the captured pane is placed again before the release', () => {
  const { toPane, mouse, gone } = createInputHarness();

  mouse(0, 9, 8, 'M');
  gone.unplaced.add(paneId(1));
  mouse(32, 16, 4, 'M');
  gone.unplaced.delete(paneId(1));
  mouse(0, 3, 6, 'm');

  expect(toPane.map((entry) => entry.text)).toEqual(['\x1b[<0;9;8M', '\x1b[<0;3;6m']);
});

it('focuses an unfocused pane on a left press and sends it the press', async () => {
  const { toPane, focused, mouse } = createInputHarness();

  mouse(0, 16, 3, 'M');
  mouse(32, 17, 3, 'M');
  mouse(0, 17, 3, 'm');
  await nextTick();

  expect(focused).toEqual([paneId(2)]);
  expect(toPane.map((entry) => entry.pane)).toEqual([paneId(2), paneId(2), paneId(2)]);
});

it('does not focus the focused pane, or a pane on a right press, a drag, or a wheel', () => {
  const { focused, mouse } = createInputHarness();

  mouse(0, 6, 3, 'M');
  mouse(0, 6, 3, 'm');
  mouse(2, 16, 3, 'M');
  mouse(2, 16, 3, 'm');
  mouse(65, 16, 3, 'M');

  expect(focused).toEqual([]);
});

it('ignores a right press and a drag that starts over a workspace or tab', () => {
  const { commands, tabs, mouse } = createInputHarness();

  mouse(2, 56, 3, 'M');
  mouse(2, 56, 3, 'm');
  mouse(32, 66, 3, 'M');

  expect(commands).toEqual([]);
  expect(tabs).toEqual([]);
});

it('holds a key typed after a focusing click until the focus settles', async () => {
  const { sent, focusGate, mouse, press } = createInputHarness();
  const gate = Promise.withResolvers<undefined>();

  focusGate.current = gate.promise;
  mouse(0, 16, 3, 'M');
  press('x');

  expect(sent).toEqual([]);

  gate.resolve();
  await gate.promise;
  await Promise.resolve();

  expect(sent).toEqual(['x']);
});

it('sends a wheel to the pane under the pointer during a held button', () => {
  const { mouse, toPane } = createInputHarness();

  mouse(0, 6, 3, 'M');
  mouse(65, 16, 3, 'M');

  expect(toPane.map((entry) => entry.pane)).toEqual([paneId(1), paneId(2)]);
});

it('keeps the pressed cell for the release when a wheel turns over the captured pane', () => {
  let unplaced = false;

  const { mouse, toPane } = createInputHarness('insert', {
    mouseTarget: (x, y, pane) => {
      if (unplaced) {
        return undefined;
      }

      return { paneId: pane ?? paneId(1), column: x, row: y };
    },
  });

  mouse(0, 6, 3, 'M');
  mouse(65, 2, 9, 'M');
  unplaced = true;
  mouse(0, 6, 3, 'm');

  expect(toPane.at(-1)).toEqual({ pane: paneId(1), text: '\x1b[<0;6;3m' });
});

it('sends nothing to the pane for an event it does not want', () => {
  const { mouse, toPane } = createInputHarness();

  mouse(35, 6, 3, 'M');

  expect(toPane).toEqual([]);
});

it('ignores a mouse report with column or row 0', () => {
  const { mouse, toPane, press, sent } = createInputHarness();

  mouse(0, 0, 1, 'M');
  mouse(0, 1, 0, 'M');
  press('a');

  expect(toPane).toEqual([]);
  expect(sent).toEqual(['a']);
});
