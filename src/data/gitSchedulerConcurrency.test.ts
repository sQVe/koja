import { describe, expect, test } from 'bun:test';

import type { PaneInfo, SpaceInfo } from 'herdr';

import {
  GitSchedulerHarness,
  mainCheckout,
  spaceOf,
  terminal,
  worldOf,
} from '../../tests/gitSchedulerHarness.ts';
import type { SchedulerLike } from '../../tests/gitSchedulerHarness.ts';
import { pick, seededRandom } from '../../tests/seeded.ts';

interface Trial {
  harness: GitSchedulerHarness;
  scheduler: SchedulerLike;
  random: () => number;
  spaces: SpaceInfo[];
  panes: PaneInfo[];
}

const paths = [
  '/code/a',
  '/code/a/sub',
  '/code/a-feature',
  '/code/a-feature/src',
  '/code/b',
  '/code/c',
  '/code/bare.git',
];

const trialFolders = (harness: GitSchedulerHarness): void => {
  harness.setFolder(null, '/code/a', mainCheckout('/code/a'));
  harness.setFolder(null, '/code/a/sub', mainCheckout('/code/a'));

  harness.setFolder(null, '/code/a-feature', {
    layout: 'false\nfalse\n/code/a/.git/worktrees/feature\n/code/a/.git\n',
    top: '/code/a-feature',
    branch: 'feature\n',
  });

  harness.setFolder(null, '/code/a-feature/src', {
    layout: 'false\nfalse\n/code/a/.git/worktrees/feature\n/code/a/.git\n',
    top: '/code/a-feature',
    branch: 'feature\n',
  });

  harness.setFolder(null, '/code/b', mainCheckout('/code/b'));

  harness.setFolder(null, '/code/bare.git', {
    layout: 'true\nfalse\n/code/bare.git\n/code/bare.git\n',
    branch: 'main\n',
  });
};

const runStep = async (trial: Trial): Promise<void> => {
  const { harness, scheduler, random, spaces, panes } = trial;
  const action = Math.floor(random() * 6);

  if (action === 0) {
    harness.setNow(harness.now + Math.floor(random() * 400));
    scheduler.tick(worldOf(spaces, panes), harness.context);

    return;
  }

  if (action === 1) {
    if (harness.watches.length > 0) {
      await harness.fire();
    }

    return;
  }

  if (action === 2) {
    const index = Math.floor(random() * spaces.length);
    const space = spaces[index];

    if (space !== undefined) {
      spaces[index] = { ...space, folder: pick(paths, random) };
    }

    return;
  }

  if (action === 3) {
    if (harness.pending.length > 0) {
      await harness.complete(pick(harness.pending, random));
    }

    return;
  }

  if (action === 4) {
    const index = Math.floor(random() * panes.length);
    const pane = panes[index];

    if (pane !== undefined) {
      const status = pane.status === 'working' ? 'idle' : 'working';

      panes[index] = { ...pane, status };
    }

    return;
  }

  harness.setNow(harness.now + Math.floor(random() * 100));
  scheduler.tick(worldOf(spaces, panes), harness.context);
};

const runTrial = async (harness: GitSchedulerHarness, trial: number): Promise<void> => {
  harness.reset();
  trialFolders(harness);

  const folders = ['/code/a', '/code/a/sub', '/code/a-feature', '/code/b'];
  const spaces = folders.map((folder, index) => spaceOf(`s${index}`, folder));
  const panes = spaces.map((space, index) => terminal(`p${index}`, `tab-${space.id}`, 'idle'));
  const scheduler = harness.start();
  const state: Trial = { harness, scheduler, random: seededRandom(trial), spaces, panes };

  for (let step = 0; step < 40; step += 1) {
    await runStep(state);
  }

  for (const read of harness.pending) {
    await harness.complete(read);
  }

  scheduler.stop();
  await harness.settle();

  expect(harness.violations).toEqual([]);
  expect(harness.watches.at(-1)?.cancelled ?? true).toBe(true);
};

describe('createGitScheduler concurrency', () => {
  test('never runs more than four reads, or more than one for a place or a known worktree', async () => {
    const harness = new GitSchedulerHarness();

    for (let trial = 0; trial < 200; trial += 1) {
      await runTrial(harness, trial);
    }
  });
});
