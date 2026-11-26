import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithText,
  elementsWithBorder,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { ActionBlockOptions, ActionFailure } from './actionBlock.ts';

const palette = {
  blocked: '#0b0b1b',
  border: '#1c1c2c',
  dim: '#2d2d3d',
  done: '#3e3e4e',
  foreground: '#4f4f5f',
  hover: '#5a5a6a',
  muted: '#6b6b7b',
  raised: '#7c7c8c',
  selected: '#8d8d9d',
  solid: '#9e9eae',
  solid_foreground: '#afafbf',
  working: '#b0b0c0',
} as const;

const folder = '~/code/koja/.tau/reviews';

const unsaved = '1 line and 2 comments are unsaved. They stay in this pane.';

const wait = 'Send to Tau waits for a save.';

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './actionBlock.ts';

const { actionBlock } = (await import(modulePath)) as {
  actionBlock: (options: ActionBlockOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const failedSave = (): ActionFailure => ({
  error: 'Could not save: the folder is read-only',
  folder,
  recovery: ['Copy path'],
  unsaved,
  wait,
});

const failedSaveBlock = (): DrawnElement =>
  actionBlock({ kind: 'action', action: 'Retry save', failure: failedSave() });

describe('actionBlock', () => {
  test('a failed save draws Retry save as the solid main action and no Send control', () => {
    const block = failedSaveBlock();
    const mainAction = elementWithText(block, 'Retry save');

    expect(mainAction?.backgroundColors).toEqual([palette.solid]);
    expect(drawnTexts(block)).not.toContain('Send to Tau');
  });

  test('a failed save puts the error, folder, recovery, and unsaved count under the action', () => {
    const block = failedSaveBlock();

    expect(drawnTexts(block)).toEqual([
      'Retry save',
      'Could not save: the folder is read-only',
      folder,
      'Copy path',
      unsaved,
      wait,
    ]);

    expect(drawnIcons(block)).toEqual(['circle-alert.svg']);
    expect(elementWithText(block, folder)?.tooltipText).toBe(folder);
  });

  test('a recovery button is a small outlined secondary button', () => {
    const block = failedSaveBlock();
    const recovery = elementWithText(block, 'Copy path');
    const outlined = elementsWithBorder(block, palette.border);

    expect(recovery?.textColors).toEqual([palette.muted]);
    expect(recovery?.backgroundColors).toEqual([]);
    expect(outlined).toHaveLength(1);
    expect(outlined[0]?.texts).toEqual(['Copy path']);
  });

  test('a ready action draws its one button and no state block', () => {
    const block = actionBlock({ kind: 'action', action: 'Send to Tau' });

    expect(drawnTexts(block)).toEqual(['Send to Tau']);
    expect(drawnIcons(block)).toEqual([]);
  });

  test('a sent review draws the check and the next step instead of a control', () => {
    const block = actionBlock({
      kind: 'sent',
      action: 'Sent to Tau',
      detail: 'Tau closes this pane after collecting the review.',
    });

    expect(drawnTexts(block)).toEqual([
      'Sent to Tau',
      'Tau closes this pane after collecting the review.',
    ]);

    expect(drawnIcons(block)).toEqual(['check.svg']);
    expect(elementWithText(block, 'Sent to Tau')?.backgroundColors).toEqual([]);
  });
});
