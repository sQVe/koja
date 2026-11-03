import { describe, expect, test } from 'bun:test';

import { folderLabel } from './paneFolder.ts';

const homeFolder = '/home/dev';

describe('folderLabel', () => {
  test('shows the home folder as a tilde', () => {
    expect(folderLabel('/home/dev', homeFolder)).toBe('~');
  });

  test('shows a folder inside home from the tilde', () => {
    expect(folderLabel('/home/dev/code/koja', homeFolder)).toBe('~/code/koja');
  });

  test('shows a folder that only shares the home name as a prefix in full', () => {
    expect(folderLabel('/home/developer/code', homeFolder)).toBe('/home/developer/code');
  });

  test('shows a folder outside home in full', () => {
    expect(folderLabel('/srv/app', homeFolder)).toBe('/srv/app');
  });

  test('shows nothing when the pane has no folder', () => {
    expect(folderLabel(null, homeFolder)).toBe('');
  });
});
