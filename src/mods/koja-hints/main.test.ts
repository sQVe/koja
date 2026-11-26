import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../../tests/moduleFakes.ts';
import { partKeyHints } from '../../kit/keyHints.ts';
import { isUpperCaseLetter } from '../../kit/keys.ts';

interface FakeView {
  render: () => DrawnElement;
}

const palette = {
  border: '#999ca7',
  popover: '#dcdee5',
  selected: '#c6c9d1',
} as const;

let shownProps: Record<string, unknown> = { part: 'w' };
let runCalls: { command: string; args: Record<string, unknown> | undefined }[] = [];
let stoppedPresses = 0;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () =>
  herdrFake({
    layout: () => ({
      id: 'root',
      children: [
        { id: 'sidebar', size: { px: 268 } },
        {
          id: 'work-body',
          padding: 6,
          gap: 6,
          children: [{ id: 'main' }, { id: 'panel', hidden: true, size: { px: 368 } }],
        },
      ],
    }),
    props: () => shownProps,
    run: (command: string, args?: Record<string, unknown>) => {
      runCalls.push({ command, args });

      return null;
    },
    settings: () => ({ font_family: 'Maple Mono' }),
    theme: () => palette,
  }),
);

const modulePath = './main.ts';

const { default: keyHintsView } = (await import(modulePath)) as {
  default: new () => FakeView;
};

afterAll(() => {
  mock.restore();
});

const keyLabel = (key: string): string => (isUpperCaseLetter(key) ? `⇧${key}` : key);

describe('key hints view', () => {
  test('draws the card of the part it was opened for', () => {
    shownProps = { part: 'w' };

    const texts = drawnTexts(new keyHintsView().render());

    const missing = partKeyHints('w')
      .groups.flatMap((group) => group.rows.flatMap((row) => row.keys))
      .map(keyLabel)
      .filter((label) => !texts.includes(label));

    expect(missing).toEqual([]);
  });

  test('draws no card for a part it does not know', () => {
    shownProps = { part: 'x' };

    expect(drawnTexts(new keyHintsView().render())).toEqual([]);
  });

  test('a press on the card cancels the sequence and is not dragged', () => {
    shownProps = { part: 'w' };
    runCalls = [];
    stoppedPresses = 0;

    const root = new keyHintsView().render();
    const [press] = root.mouseHandlers['on_mouse_down:left'] ?? [];

    press?.({}, { stop_propagation: () => (stoppedPresses += 1) });

    expect(runCalls).toEqual([{ command: 'koja-modal.cancel', args: undefined }]);
    expect(stoppedPresses).toBe(1);
  });
});
