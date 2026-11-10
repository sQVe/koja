import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnTexts, drawnTooltips, elementWithText } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

interface ReviewFixture {
  item: { facts: { name: string; value: string }[] };
  selected: { lines: string[]; comments: { text: string }[] };
}

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));
await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({
    icon: (name: string) => drawn(name),
    dialogButton: (options: { label: string }) => {
      const button = drawn();

      button.texts.push(options.label);

      return button;
    },
  }),
);

const documentsPath = './documents.ts';
const sourcePath = './source.ts';
const viewsPath = './views.ts';
const partsPath = './parts.ts';
const actionsPath = './actions.ts';
const conflictPath = './conflict.ts';
const tokensPath = '../koja.ts';

const { draftView } = (await import(viewsPath)) as {
  draftView: (state: string) => ReviewFixture;
};

const { koja } = (await import(tokensPath)) as {
  koja: { marks: { modified: string; added: string; removed: string } };
};

const { pinnedDocument } = (await import(documentsPath)) as {
  pinnedDocument: (view: unknown, tokens: unknown) => DrawnElement;
};

const { sourceLines } = (await import(sourcePath)) as {
  sourceLines: (file: unknown, look: unknown, tokens: unknown) => DrawnElement;
};

const { fileNavigation } = (await import(partsPath)) as {
  fileNavigation: (view: unknown, tokens: unknown) => DrawnElement;
};

const { draftActions } = (await import(actionsPath)) as {
  draftActions: (state: string, tokens: unknown) => DrawnElement;
};

const { conflictBlock } = (await import(conflictPath)) as {
  conflictBlock: (tokens: unknown) => DrawnElement;
};

const documentFor = (state: string): DrawnElement => pinnedDocument(draftView(state), koja);

const linesFor = (state: string): DrawnElement => {
  const view = draftView(state);

  return sourceLines(view.selected, { state, inline: state !== 'edit-file' }, koja);
};

afterAll(() => {
  mock.restore();
});

describe('draft review documents', () => {
  test.each([
    ['comment', 18],
    ['normal', 18],
    ['range', 20],
    ['plan', 14],
  ] as const)('%s exposes comment and edit actions on its current line', (state, number) => {
    const tooltips = drawnTooltips(linesFor(state));

    expect(tooltips).toContain(`Comment on line ${number}`);
    expect(tooltips).toContain(`Edit line ${number}`);
  });

  test.each(['edit-file', 'sent'] as const)('%s has no read-view line actions', (state) => {
    expect(drawnTooltips(linesFor(state))).toEqual([]);
  });

  test('kept edits appear in the facts and file list', () => {
    for (const state of ['comment', 'edit-line', 'plan'] as const) {
      const view = draftView(state);
      const edits = view.item.facts.find((fact: { name: string }) => fact.name === 'Edits');
      const navigation = fileNavigation(view, koja);

      expect(edits?.value).toBe(state === 'plan' ? '2 lines' : '1 line');
      expect(elementWithText(navigation, 'M')?.textColors).toContain(koja.marks.modified);
      expect(drawnTexts(navigation)).not.toContain('0');
    }
  });

  test('an open line edit follows the kept line and leaves its mark intact', () => {
    const view = draftView('edit-line');
    const texts = drawnTexts(linesFor('edit-line'));
    const field = texts.findIndex((text) => text.endsWith('▏'));

    expect(field).toBeGreaterThan(texts.indexOf(view.selected.lines[6] ?? ''));
    expect(field).toBeLessThan(texts.indexOf('9'));
    expect(texts.filter((text) => text === 'edited')).toHaveLength(1);
  });

  test('whole-file editing keeps both comments readable before its source', () => {
    const view = draftView('edit-file');
    const texts = drawnTexts(documentFor('edit-file'));
    const source = texts.indexOf(view.selected.lines[0] ?? '');

    for (const comment of view.selected.comments) {
      const summary = texts.findIndex((text) => text.includes(comment.text));

      expect(summary).toBeGreaterThan(-1);
      expect(summary).toBeLessThan(source);
    }

    expect(texts).toContain('Saved just now');
  });

  test('a disk conflict provides a main action and distinguishes the changed words', () => {
    const actions = draftActions('changed-on-disk', koja);
    const conflict = conflictBlock(koja);

    expect(drawnTexts(actions)).toContain('Go to line 6');
    expect(elementWithText(conflict, 'in view when')?.textColors).toContain(koja.marks.added);
    expect(elementWithText(conflict, 'visible while')?.textColors).toContain(koja.marks.removed);
  });

  test('a failed save labels both the unsaved line and comment', () => {
    expect(drawnTexts(linesFor('saving-failed')).filter((text) => text === 'unsaved')).toHaveLength(
      2,
    );
  });

  test.each([
    ['range', 'body.md'],
    ['file-comment', 'release-notes.md'],
  ] as const)('%s starts at the composing file', (state, name) => {
    const texts = drawnTexts(documentFor(state));

    expect(texts[0]).toBe(name);
    expect(texts).not.toContain('title.md');
  });

  test.each([
    'comment',
    'edit-line',
    'edit-file',
    'saving-failed',
    'changed-on-disk',
    'sent',
    'normal',
  ] as const)('%s starts with the title file before the body', (state) => {
    const texts = drawnTexts(documentFor(state));
    const title = texts.indexOf('title.md');

    expect(title).toBeGreaterThan(-1);
    expect(title).toBeLessThan(texts.indexOf('body.md'));
  });
});
