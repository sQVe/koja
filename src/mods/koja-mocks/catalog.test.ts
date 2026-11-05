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

  test('a name past the last smoke scene gives an error', () => {
    expect('error' in findScene('smoke-5')).toBe(true);
  });
});
