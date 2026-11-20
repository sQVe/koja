import { describe, expect, test } from 'bun:test';

import { paneHeaderFields } from './paneHeaderFields.ts';
import { paneHeaderWidth, shellSize } from './size.ts';

const name = 'Claude Code';

const task = 'Build window shell';
const branch = 'me-1089-window-shell';
const longTask = 'Move pane headers onto the shared kit part';
const longBranch = 'me-1089-window-shell-layout-and-tab-bar';
const longFolder = '~/code/koja/packages/desktop/src/mods/koja-mocks';

const fixedWithFour = 210;
const fixedCompact = 138;

const branchFull =
  branch.length * paneHeaderWidth.glyph + paneHeaderWidth.branchIcon + paneHeaderWidth.gap;

const folderFull = longFolder.length * paneHeaderWidth.glyph + paneHeaderWidth.gap;

describe('paneHeaderFields', () => {
  test('shows every field full at an unmeasured width', () => {
    const fields = paneHeaderFields({ statusWidth: 0, name, task, branch, folder: '~/code/koja' });

    expect(fields).toEqual({
      task: true,
      role: 'full',
      branch: 'full',
      folder: 'full',
      compact: false,
    });
  });

  test('shows every field full at a measured width that fits them', () => {
    const fields = paneHeaderFields({
      statusWidth: 0,
      width: 900,
      name,
      task,
      branch,
      folder: '~/code/koja',
    });

    expect(fields).toEqual({
      task: true,
      role: 'full',
      branch: 'full',
      folder: 'full',
      compact: false,
    });
  });

  test('marks the header compact exactly below the compact width', () => {
    const at = paneHeaderFields({
      statusWidth: 0,
      width: paneHeaderWidth.compact,
      name,
      task: 'Header',
    });

    const below = paneHeaderFields({
      statusWidth: 0,
      width: paneHeaderWidth.compact - 1,
      name,
      task: 'Header',
    });

    expect(at.compact).toBe(false);
    expect(below.compact).toBe(true);
  });

  test('cuts the branch exactly when it stops fitting full', () => {
    const at = paneHeaderFields({
      statusWidth: 0,
      width: fixedWithFour + branchFull,
      name,
      branch,
    });

    const below = paneHeaderFields({
      statusWidth: 0,
      width: fixedWithFour + branchFull - 1,
      name,
      branch,
    });

    expect(at.branch).toBe('full');
    expect(below.branch).toBe('cut');
    expect(below.compact).toBe(false);
  });

  test('drops the branch exactly below its minimum width', () => {
    const at = paneHeaderFields({
      statusWidth: 0,
      width: fixedCompact + paneHeaderWidth.fieldMinimum + paneHeaderWidth.gap,
      name,
      branch,
    });

    const below = paneHeaderFields({
      statusWidth: 0,
      width: fixedCompact + paneHeaderWidth.fieldMinimum + paneHeaderWidth.gap - 1,
      name,
      branch,
    });

    expect(at.branch).toBe('cut');
    expect(below.branch).toBe('dropped');
    expect(below.compact).toBe(true);
  });

  test('cuts the folder exactly when it stops fitting full', () => {
    const at = paneHeaderFields({
      statusWidth: 0,
      width: fixedWithFour + folderFull,
      name,
      folder: longFolder,
    });

    const below = paneHeaderFields({
      statusWidth: 0,
      width: fixedWithFour + folderFull - 1,
      name,
      folder: longFolder,
    });

    expect(at.folder).toBe('full');
    expect(below.folder).toBe('cut');
    expect(below.compact).toBe(false);
  });

  test('drops the folder exactly below its minimum width', () => {
    const at = paneHeaderFields({
      statusWidth: 0,
      width: fixedCompact + paneHeaderWidth.fieldMinimum + paneHeaderWidth.gap,
      name,
      folder: longFolder,
    });

    const below = paneHeaderFields({
      statusWidth: 0,
      width: fixedCompact + paneHeaderWidth.fieldMinimum + paneHeaderWidth.gap - 1,
      name,
      folder: longFolder,
    });

    expect(at.folder).toBe('cut');
    expect(below.folder).toBe('dropped');
    expect(below.compact).toBe(true);
  });

  test('a role badge cuts the folder at a width that fits it whole without a role', () => {
    const width = fixedWithFour + folderFull;
    const withoutRole = paneHeaderFields({ statusWidth: 0, width, name, folder: longFolder });

    const withRole = paneHeaderFields({
      statusWidth: 0,
      width,
      name,
      folder: longFolder,
      role: 'architect',
    });

    expect(withoutRole.folder).toBe('full');
    expect(withRole.folder).toBe('cut');
  });

  test('a long role label cuts only after the folder and branch give way', () => {
    const roomy = paneHeaderFields({
      statusWidth: 0,
      width: shellSize.folderCutWidth,
      name,
      role: 'integration-test-runner',
      task,
      branch,
      folder: longFolder,
    });

    const tight = paneHeaderFields({
      statusWidth: 0,
      width: 300,
      name,
      role: 'integration-test-runner',
      task,
      branch: longBranch,
      folder: longFolder,
    });

    expect(roomy.folder).toBe('cut');
    expect(roomy.role).toBe('full');
    expect(tight.branch).toBe('dropped');
    expect(tight.folder).toBe('dropped');
    expect(tight.role).toBe('cut');
  });

  test('a long role label shows whole while the header has room', () => {
    const fields = paneHeaderFields({
      statusWidth: 0,
      width: shellSize.folderCutWidth,
      name: 'Pi',
      role: 'integration-test-runner',
      task,
      branch,
      folder: longFolder,
    });

    expect(fields.role).toBe('full');
  });

  test('cuts the task only after both fields drop', () => {
    const fields = paneHeaderFields({
      statusWidth: 0,
      width: 420,
      name,
      task: longTask,
      branch: longBranch,
      folder: longFolder,
    });

    expect(fields.branch).toBe('dropped');
    expect(fields.folder).toBe('dropped');
    expect(fields.task).toBe(true);
    expect(fields.compact).toBe(true);
  });

  test('shows a field only when it has text', () => {
    const folderOnly = paneHeaderFields({
      statusWidth: 0,
      width: 760,
      name,
      task: '',
      folder: '~/code/koja',
    });

    const taskOnly = paneHeaderFields({ statusWidth: 0, width: 760, name, task: 'Header' });

    expect(folderOnly).toEqual({
      task: false,
      role: 'full',
      branch: 'dropped',
      folder: 'full',
      compact: false,
    });

    expect(taskOnly).toEqual({
      task: true,
      role: 'full',
      branch: 'dropped',
      folder: 'dropped',
      compact: false,
    });
  });
});
