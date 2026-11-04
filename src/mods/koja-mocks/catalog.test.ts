import { describe, expect, test } from 'bun:test';

import { overlaySize } from '../../kit/size.ts';
import { findScene } from './catalog.ts';

describe('scene lookup', () => {
  test('an unknown name gives an error that contains the name', () => {
    const result = findScene('no-such-scene');

    expect('error' in result && result.error).toContain('no-such-scene');
  });

  test('a blank name gives an error', () => {
    expect('error' in findScene('   ')).toBe(true);
  });

  test('the sample scene gives its name and size', () => {
    expect(findScene('sidebar')).toEqual({
      scene: {
        name: 'sidebar',
        width: overlaySize.wideMenuWidth,
        height: overlaySize.wideMenuHeight,
      },
    });
  });

  test('spaces around a known name still find the scene', () => {
    expect(findScene('  sidebar  ')).toEqual(findScene('sidebar'));
  });
});
