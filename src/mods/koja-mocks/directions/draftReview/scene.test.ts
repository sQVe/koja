import { describe, expect, test } from 'bun:test';

import { overlaySize } from '../../../../kit/size.ts';
import { findScene } from '../../catalog.ts';

describe('draft review scenes', () => {
  test('all eleven review states open at the shell size', () => {
    const states = [
      'comment',
      'range',
      'file-comment',
      'edit-line',
      'edit-file',
      'saving-failed',
      'changed-on-disk',
      'sent',
      'broken',
      'plan',
      'normal',
    ] as const;

    for (const state of states) {
      const name = `draft-review-${state}` as const;

      expect(findScene(name)).toEqual({
        scene: { name, width: overlaySize.shellWidth, height: overlaySize.shellHeight },
      });
    }
  });

  test('the superseded scene names no longer open', () => {
    const variants = [
      'annotated',
      'scroll',
      'margin',
      'rendered',
      'rendered-edit',
      'refined-comment',
      'refined-edit-line',
      'refined-edit-file',
      'margin-comment',
      'margin-edit-line',
    ];

    for (const variant of variants) {
      expect(findScene(`draft-review-${variant}`)).toHaveProperty('error');
    }
  });
});
