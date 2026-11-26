import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnTexts, elementsWithStyle } from '../../../tests/drawn.ts';
import { keyLabel } from '../../../tests/keyLabels.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../../tests/moduleFakes.ts';
import { partKeyHints, partLetters } from '../../kit/keyHints.ts';
import { actionName } from '../../kit/keyNames.ts';

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

describe('key hints view', () => {
  test.each(partLetters)('draws the card of the %s part', (part) => {
    shownProps = { part };

    const texts = drawnTexts(new keyHintsView().render());

    const missing = partKeyHints(part)
      .groups.flatMap((group) => group.rows.flatMap((row) => row.keys))
      .map(keyLabel)
      .filter((label) => !texts.includes(label));

    expect(texts).toContain(partKeyHints(part).title);
    expect(missing).toEqual([]);
  });

  test('places the card on the main column, above the pane bottoms', () => {
    shownProps = { part: 'w' };

    const [placed] = elementsWithStyle(new keyHintsView().render(), 'left');

    expect([placed?.styles['left'], placed?.styles['right'], placed?.styles['bottom']]).toEqual([
      [274],
      [6],
      [30],
    ]);
  });

  test('draws the list action of a marked list instead of the table row it shadows', () => {
    shownProps = { part: 'g', count: null, list: true };

    const texts = drawnTexts(new keyHintsView().render());

    const listLabel = actionName({ kind: 'list', action: 'first' });
    const scrollLabel = actionName({ kind: 'command', command: 'terminal.scroll' });

    expect(texts.filter((text) => text === listLabel)).toHaveLength(1);
    expect(texts.filter((text) => text === scrollLabel)).toEqual([]);
  });

  test('draws the counted action the next key will run', () => {
    shownProps = { part: 'g', count: 3, list: false };

    const tabLabel = actionName({ kind: 'nthTab', index: 3 });
    const shown = drawnTexts(new keyHintsView().render()).filter((text) => text === tabLabel);

    expect(shown).toHaveLength(1);
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
