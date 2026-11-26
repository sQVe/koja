import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithIcon,
  elementWithText,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { PartNoteOptions } from './partNote.ts';

const palette = {
  blocked: '#0b0b1b',
  border: '#1c1c2c',
  dim: '#2d2d3d',
  foreground: '#4f4f5f',
  muted: '#6b6b7b',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './partNote.ts';

const { partNote } = (await import(modulePath)) as {
  partNote: (options: PartNoteOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const checksNote = partNote({ part: 'checks', age: '6m ago' });

const messageOf = (note: DrawnElement): string => {
  const message = drawnTexts(note).find((text) => text.startsWith('Could not sync'));

  if (message === undefined) {
    throw new Error('The note draws no message.');
  }

  return message;
};

const retryOf = (note: DrawnElement): DrawnElement | undefined => note.kids.at(-1);

describe('partNote', () => {
  test('a part note names the part, its age, and a Retry action', () => {
    const message = messageOf(checksNote);

    expect(message).toContain('checks');
    expect(message).toContain('6m ago');
    expect(drawnTexts(checksNote)).toContain('Retry');
  });

  test('the note marks the failure with the alert icon', () => {
    expect(drawnIcons(checksNote)).toEqual(['circle-alert.svg']);
    expect(elementWithIcon(checksNote, 'circle-alert.svg')?.textColors).toEqual([palette.blocked]);
  });

  test('the note reads in the dim ink and Retry follows it at the row end', () => {
    const message = elementWithText(checksNote, messageOf(checksNote));
    const retry = retryOf(checksNote);

    expect(message?.textColors).toEqual([palette.dim]);
    expect(elementWithText(checksNote, 'Retry')?.textColors).toEqual([palette.muted]);

    const retryTexts = retry === undefined ? [] : drawnTexts(retry);

    expect(retryTexts).toEqual(['Retry']);
  });

  test('the note names the part it belongs to', () => {
    expect(messageOf(partNote({ part: 'threads', age: '2m ago' }))).toContain('threads');
    expect(messageOf(partNote({ part: 'threads', age: '2m ago' }))).not.toContain('checks');
  });

  test('Retry reads the part again when the note binds it', () => {
    let retries = 0;
    let stopped = 0;

    const note = partNote({
      part: 'checks',
      age: '6m ago',
      onRetry: () => {
        retries += 1;
      },
    });

    const retry = retryOf(note);

    if (retry !== undefined) {
      retry.clickHandlers[0]?.(
        {},
        {
          stop_propagation: () => {
            stopped += 1;
          },
        },
      );
    }

    expect(retries).toBe(1);
    expect(stopped).toBe(1);
    expect(note.clickHandlers).toEqual([]);
  });

  test('a note without a retry handler draws a quiet Retry', () => {
    const retry = retryOf(checksNote);

    expect(retry?.clickHandlers).toEqual([]);
    expect(retry?.styles['cursor_pointer']).toBeUndefined();
  });
});
