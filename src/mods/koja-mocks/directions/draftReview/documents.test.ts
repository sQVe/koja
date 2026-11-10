import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, drawnTooltips } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

interface ReviewFile {
  name: string;
  lines: string[];
  comments: { text: string }[];
}

interface ReviewFixture {
  files: ReviewFile[];
  selected: ReviewFile;
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
      const button = drawn('button');

      button.texts.push(options.label);

      return button;
    },
  }),
);

const dataPath = './data.ts';
const documentsPath = './documents.ts';
const sourcePath = './source.ts';
const viewsPath = './views.ts';
const partsPath = './parts.ts';
const tokensPath = '../koja.ts';

const { draftView } = (await import(viewsPath)) as {
  draftView: (state: string) => ReviewFixture;
};

const { openLineEdit } = (await import(dataPath)) as {
  openLineEdit: { line: number; text: string };
};

const { koja } = (await import(tokensPath)) as { koja: unknown };

const { pinnedDocument } = (await import(documentsPath)) as {
  pinnedDocument: (view: unknown, tokens: unknown) => DrawnElement;
};

const { sourceLines } = (await import(sourcePath)) as {
  sourceLines: (file: unknown, look: unknown, tokens: unknown) => DrawnElement;
};

const { fileHeading } = (await import(partsPath)) as {
  fileHeading: (file: unknown, view: unknown, tokens: unknown) => DrawnElement;
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
  test.each(['comment', 'normal', 'range', 'plan', 'saving-failed', 'file-comment'] as const)(
    '%s exposes both current-line actions',
    (state) => {
      expect(drawnTooltips(linesFor(state))).toHaveLength(2);
    },
  );

  test.each(['edit-file', 'sent', 'changed-on-disk'] as const)(
    '%s has no read-view line actions',
    (state) => {
      expect(drawnTooltips(linesFor(state))).toEqual([]);
    },
  );

  test('an open line edit replaces only its source line', () => {
    const view = draftView('edit-line');
    const texts = drawnTexts(linesFor('edit-line'));

    expect(texts).toContain(view.selected.lines[5] ?? '');
    expect(texts).toContain(view.selected.lines[6] ?? '');
    expect(texts).not.toContain(view.selected.lines[7] ?? '');

    const field = texts.findIndex((text) => text.startsWith(openLineEdit.text));
    const followingLine = texts.indexOf(String(openLineEdit.line + 1));

    expect(field).toBeGreaterThan(-1);
    expect(texts.indexOf(view.selected.lines[6] ?? '')).toBeLessThan(field);
    expect(field).toBeLessThan(followingLine);
  });

  test('whole-file editing keeps both comments before its source', () => {
    const view = draftView('edit-file');
    const texts = drawnTexts(documentFor('edit-file'));
    const source = texts.indexOf(view.selected.lines[0] ?? '');

    for (const comment of view.selected.comments) {
      const summary = texts.indexOf(comment.text);

      expect(summary).toBeGreaterThan(-1);
      expect(summary).toBeLessThan(source);
    }
  });

  test.each([
    'comment',
    'edit-line',
    'edit-file',
    'saving-failed',
    'changed-on-disk',
    'plan',
    'range',
    'file-comment',
    'normal',
  ] as const)('%s keeps actions on current and other file headers', (state) => {
    const view = draftView(state);
    const current = fileHeading(view.selected, view, koja);

    const currentActionCount = state === 'edit-file' ? 1 : 2;

    expect(drawnIcons(current).filter((name) => name === 'button')).toHaveLength(
      currentActionCount,
    );

    for (const file of view.files.filter((candidate) => candidate !== view.selected)) {
      const actions = drawnIcons(fileHeading(file, view, koja));

      expect(actions.filter((name) => name === 'button')).toHaveLength(2);
    }
  });

  test('sent file headers have no comment or edit actions', () => {
    const view = draftView('sent');

    for (const file of view.files) {
      const heading = fileHeading(file, view, koja);

      expect(drawnTooltips(heading)).toEqual([]);
      expect(drawnIcons(heading)).not.toContain('button');
    }
  });

  test.each(['range', 'file-comment'] as const)('%s starts at the composing file', (state) => {
    const texts = drawnTexts(documentFor(state));

    expect(texts[0]).toBe(draftView(state).selected.name);
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
