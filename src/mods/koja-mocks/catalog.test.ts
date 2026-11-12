import { describe, expect, test } from 'bun:test';

import { overlaySize } from '../../kit/size.ts';
import { findScene } from './catalog.ts';
import type { SceneName } from './catalog.ts';

describe('scene lookup', () => {
  test('an unknown name gives an error that contains the name', () => {
    const result = findScene('no-such-scene');

    expect('error' in result && result.error).toContain('no-such-scene');
  });

  test('a blank name gives an error', () => {
    expect('error' in findScene('   ')).toBe(true);
  });

  const sceneSizes: { name: SceneName; width: number; height: number }[] = [
    { name: 'sidebar', width: overlaySize.wideMenuWidth, height: overlaySize.wideMenuHeight },
    { name: 'states', width: overlaySize.promptWidth, height: overlaySize.worktreeListHeight },
    {
      name: 'popup',
      width: overlaySize.worktreeListWidth,
      height: overlaySize.worktreeListHeight,
    },
    { name: 'controls', width: overlaySize.worktreeListWidth, height: overlaySize.wideMenuHeight },
    { name: 'shell', width: overlaySize.shellWidth, height: overlaySize.shellHeight },
    { name: 'shell-dialog', width: overlaySize.shellWidth, height: overlaySize.shellHeight },
    { name: 'shell-content', width: overlaySize.shellWidth, height: overlaySize.shellHeight },
    { name: 'shell-pr-view', width: overlaySize.shellWidth, height: overlaySize.shellHeight },
    { name: 'shell-draft-review', width: overlaySize.shellWidth, height: overlaySize.shellHeight },
    { name: 'shell-ticket', width: overlaySize.shellWidth, height: overlaySize.shellHeight },
    {
      name: 'pane-headers',
      width: overlaySize.paneHeadersWidth,
      height: overlaySize.paneHeadersHeight,
    },
  ];

  test.each(sceneSizes)('the $name scene gives its name and size', (scene) => {
    expect(findScene(scene.name)).toEqual({ scene });
  });

  test('an error for an unknown name lists every scene', () => {
    const result = findScene('no-such-scene');
    const message = 'error' in result ? result.error : '';

    expect(sceneSizes.filter((scene) => !message.includes(scene.name))).toEqual([]);
  });

  test('spaces around a known name still find the scene', () => {
    expect(findScene('  sidebar  ')).toEqual(findScene('sidebar'));
  });

  test('every smoke scene is found', () => {
    for (let index = 1; index <= 4; index += 1) {
      const name = `smoke-${index}`;

      expect(findScene(name)).toHaveProperty('scene.name', name);
    }
  });

  const directionScenes: SceneName[] = [
    'direction-koja',
    'direction-koja-normal',
    'panels-tabs-stack',
    'panels-tabs-changes',
    'panels-tabs-workers',
    'panels-tabs-files',
    'panels-sections',
    'panels-spine',
    'panels-spine-files',
    'panels-docks',
    'spine-inline',
    'spine-rail',
    'spine-pinned',
    'rail-busy',
    'rail-clean',
    'rail-single',
    'rail-no-pr',
    'rail-main',
    'rail-error',
    'rail-normal',
    'split-two-base',
    'split-two-busy',
    'split-two-main',
    'split-three-base',
    'split-three-busy',
    'split-three-main',
    'space-base',
    'space-busy',
    'space-clean',
    'space-single',
    'space-no-pr',
    'space-main',
    'space-error',
    'space-normal',
  ];

  test.each(directionScenes)('the %s scene opens at the shell size', (name) => {
    expect(findScene(name)).toEqual({
      scene: { name, width: overlaySize.shellWidth, height: overlaySize.shellHeight },
    });
  });

  test('every Rail item and state opens at the shell size', () => {
    const items = [
      'review',
      'review-saving-failed',
      'review-sent',
      'review-narrow',
      'pr',
      'pr-checks-failed',
      'pr-unreachable',
      'pr-normal',
      'ticket',
      'ticket-loading',
      'ticket-long',
    ] as const;

    for (const item of items) {
      const name = `content-rail-${item}` as const;

      expect(findScene(name)).toEqual({
        scene: { name, width: overlaySize.shellWidth, height: overlaySize.shellHeight },
      });
    }
  });

  const overlayScenes = ['palette', 'goto', 'keys', 'menu', 'new', 'menu-normal', 'new-normal'].map(
    (surface) => `overlay-${surface}`,
  );

  test.each(overlayScenes)('the %s scene opens at the shell size', (name) => {
    expect(findScene(name)).toHaveProperty('scene', {
      name,
      width: overlaySize.shellWidth,
      height: overlaySize.shellHeight,
    });
  });

  test.each(['overlay-cards-palette', 'overlay-wide-keys', 'overlay-box-palette'])(
    'the dropped %s scene gives an error',
    (name) => {
      expect('error' in findScene(name)).toBe(true);
    },
  );

  test('all stable dialog scenes open at shell size', () => {
    const asks = [
      'close',
      'close-normal',
      'rename',
      'rename-normal',
      'wt-new',
      'wt-open',
      'wt-remove',
    ];

    for (const ask of asks) {
      const name = `dialog-${ask}`;

      expect(findScene(name)).toHaveProperty('scene', {
        name,
        width: overlaySize.shellWidth,
        height: overlaySize.shellHeight,
      });
    }
  });

  test('dialog take names no longer open', () => {
    for (const take of ['card', 'compact', 'sheet', 'keys']) {
      for (const ask of [
        'close',
        'close-normal',
        'rename',
        'rename-normal',
        'wt-new',
        'wt-remove',
        'wt-open',
      ]) {
        expect(findScene(`dialog-${take}-${ask}`)).toHaveProperty('error');
      }
    }
  });

  test('the discarded dialog ideas no longer open', () => {
    for (const idea of ['list', 'place']) {
      for (const ask of ['close', 'rename', 'close-normal', 'rename-normal']) {
        expect(findScene(`dialog-${idea}-${ask}`)).toHaveProperty('error');
      }
    }
  });

  test('all current PR states and prompt trays open at shell size', () => {
    const states = [
      'blocked',
      'sent',
      'ready',
      'ready-menu',
      'merge-confirm',
      'merge-failed',
      'checks-failed',
      'unreachable',
      'normal',
      'zoomed',
    ];

    const names = states.map((state) => `pr-view-${state}`);

    names.push('pr-tray-bar', 'pr-tray-header', 'pr-tray-section');

    for (const name of names) {
      expect(findScene(name)).toHaveProperty('scene', {
        name,
        width: overlaySize.shellWidth,
        height: overlaySize.shellHeight,
      });
    }
  });

  test('the discarded PR takes no longer open', () => {
    for (const take of ['reader', 'box', 'handoff', 'merge', 'agent', 'split']) {
      for (const state of ['blocked', 'ready', 'diff']) {
        expect(findScene(`pr-${take}-${state}`)).toHaveProperty('error');
      }
    }
  });

  test('a name past the last smoke scene gives an error', () => {
    expect('error' in findScene('smoke-5')).toBe(true);
  });
});
