import { describe, expect, test } from 'bun:test';

import type { CardText } from './card.ts';
import { cardGeometry, cardHeight, moreText, windowBoundsOf } from './card.ts';

const text: CardText = {
  question: 'Allow this command?',
  command: 'bun run sandbox up',
  more: null,
};

const sources = (width: number, height: number, panelHidden = true) => ({
  window: { width, height },
  sidebar: { sizePx: 268, hidden: false },
  panel: { sizePx: 368, hidden: panelHidden },
});

describe('moreText', () => {
  test('counts one ask and several asks', () => {
    expect(moreText({ count: 1, space: 'Hill-climb' })).toBe('1 more ask in Hill-climb');
    expect(moreText({ count: 2, space: 'Hill-climb' })).toBe('2 more asks in Hill-climb');
  });
});

describe('cardHeight', () => {
  test('grows with the command, the more line, and the normal-mode footer', () => {
    const base = cardHeight({ ...text, command: null }, 420, false);

    expect(cardHeight(text, 420, false)).toBeGreaterThan(base);

    expect(cardHeight({ ...text, more: '1 more ask in X' }, 420, false)).toBeGreaterThan(
      cardHeight(text, 420, false),
    );

    expect(cardHeight(text, 420, true)).toBeGreaterThan(cardHeight(text, 420, false));
  });
});

describe('cardGeometry', () => {
  test('centers the card in the main column and leaves 16 px above the pane bottom', () => {
    const geometry = cardGeometry(sources(1280, 820), text, false);
    const height = cardHeight(text, 420, false);

    expect(geometry.width).toBe(420);
    expect(geometry.height).toBe(height);
    expect(geometry.at).toEqual({ x: 564, y: 820 - 6 - 16 - height });
  });

  test('keeps the main column between the sidebar and a shown panel', () => {
    const geometry = cardGeometry(sources(1280, 820, false), text, false);

    expect(geometry.at?.x).toBe(268 + (1280 - 268 - 368 - 420) / 2);
  });

  test('shrinks the card to the main column less its two 16 px insets', () => {
    const geometry = cardGeometry(sources(640, 820), text, false);

    expect(geometry.width).toBe(640 - 268 - 32);
  });

  test('opens centered when the window size is unknown', () => {
    const geometry = cardGeometry({ ...sources(0, 0), window: null }, text, false);

    expect(geometry.at).toBeNull();
    expect(geometry.width).toBe(420);
  });
});

describe('windowBoundsOf', () => {
  test('reads the width and height from the window bounds', () => {
    expect(windowBoundsOf({ state: 'windowed', bounds: [0, 0, 1280, 820] })).toEqual({
      width: 1280,
      height: 820,
    });
  });

  test('rejects a missing or empty size', () => {
    expect(windowBoundsOf(null)).toBeNull();
    expect(windowBoundsOf({ bounds: [0, 0] })).toBeNull();
    expect(windowBoundsOf({ bounds: [0, 0, 0, 820] })).toBeNull();
  });
});
