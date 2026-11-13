import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';

interface OpenedSpec {
  mod?: string;
  props?: Record<string, unknown>;
}

let openedSpecs: OpenedSpec[] = [];

await mock.module('herdr', () =>
  herdrFake({
    openOverlay: (spec: OpenedSpec) => {
      openedSpecs.push(spec);

      return 'overlay-1';
    },
  }),
);

const { openGroveDialog, openWorktreeDialog } = await import('./worktree.ts');

const opened = (): { mod: string | undefined; props: Record<string, unknown> | undefined }[] =>
  openedSpecs.map((spec) => ({ mod: spec.mod, props: spec.props }));

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  openedSpecs = [];
});

describe('worktree dialogs', () => {
  test('the Grove dialog opens koja-worktree with the action and space', () => {
    openGroveDialog('new', 'space-1');
    openGroveDialog('remove', 'space-2');

    expect(opened()).toEqual([
      { mod: 'koja-worktree', props: { action: 'new', space: 'space-1' } },
      { mod: 'koja-worktree', props: { action: 'remove', space: 'space-2' } },
    ]);
  });

  test('the worktree dialog still opens Herdr’s worktree mod', () => {
    openWorktreeDialog('open', 'space-1');
    openWorktreeDialog('new', null, '/work/repo');

    expect(opened()).toEqual([
      { mod: 'worktree', props: { space: 'space-1', action: 'open' } },
      { mod: 'worktree', props: { space: null, action: 'new', folder: '/work/repo' } },
    ]);
  });
});
