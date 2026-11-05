import { describe, expect, test } from 'bun:test';

import { paneHeaderFields } from './paneHeaderFields.ts';
import { paneHeaderWidth } from './size.ts';

const name = 'Claude Code';

const longTask = 'Move pane headers onto the shared kit part';
const longBranch = 'me-1089-window-shell-layout-and-tab-bar';
const longFolder = '~/code/koja/packages/desktop/src/mods/koja-mocks';

describe('paneHeaderFields', () => {
  test('a long task drops the folder before the task cuts', () => {
    const fields = paneHeaderFields({
      width: 800,
      name,
      task: longTask,
      branch: longBranch,
      folder: longFolder,
    });

    expect(fields.folder).toBe(false);
    expect(fields.branch).toBe(true);
    expect(fields.task).toBe(true);
  });

  test('a narrower header drops the branch before the task cuts', () => {
    const fields = paneHeaderFields({
      width: 700,
      name,
      task: longTask,
      branch: longBranch,
      folder: longFolder,
    });

    expect(fields.folder).toBe(false);
    expect(fields.branch).toBe(false);
    expect(fields.task).toBe(true);
  });

  test('a short task keeps the folder and the branch at a medium width', () => {
    const fields = paneHeaderFields({
      width: 560,
      name,
      task: 'Header',
      branch: 'me-1089-window-shell',
      folder: '~/code/koja',
    });

    expect(fields.folder).toBe(true);
    expect(fields.branch).toBe(true);
    expect(fields.task).toBe(true);
  });

  test('marks the header compact below the compact width', () => {
    const atLine = paneHeaderFields({ width: paneHeaderWidth.compact, name, task: 'Header' });

    const belowLine = paneHeaderFields({
      width: paneHeaderWidth.compact - 1,
      name,
      task: 'Header',
    });

    expect(atLine.compact).toBe(false);

    expect(belowLine.compact).toBe(true);
  });

  test('shows a field only when it has text', () => {
    const folderOnly = paneHeaderFields({
      width: 760,
      name,
      task: '',
      folder: '~/code/koja',
    });

    const taskOnly = paneHeaderFields({ width: 760, name, task: 'Header' });

    expect(folderOnly).toEqual({
      task: false,
      branch: false,
      folder: true,
      compact: false,
    });

    expect(taskOnly).toEqual({
      task: true,
      branch: false,
      folder: false,
      compact: false,
    });
  });
});
