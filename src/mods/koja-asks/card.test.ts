import { describe, expect, test } from 'bun:test';

import { askCardSize, spacing } from '../../kit/size.ts';
import type { Ask } from './askFacts.ts';
import type { AskRow, CardText, CardWindow } from './card.ts';
import {
  cardGeometry,
  cardHeight,
  cardSignature,
  listHeight,
  moreText,
  windowBoundsOf,
} from './card.ts';

const ask: Ask = {
  identity: 't1:permission:bun run sandbox up',
  address: 't1',
  spaceId: 's1',
  spaceName: 'Build window shell',
  project: 'koja',
  tabId: 'k1',
  paneId: 'p1',
  agent: 'Claude Code',
  kind: 'permission',
  question: 'Allow this command?',
  command: 'bun run sandbox up',
  seq: 1,
};

const row = (overrides: Partial<Ask> = {}, project = 'koja', age = '2m'): AskRow => ({
  ask: { ...ask, ...overrides },
  project,
  age,
});

const text: CardText = {
  question: 'Allow this command?',
  command: 'bun run sandbox up',
  more: null,
};

const sources = (
  width: number,
  height: number,
  panelHidden = true,
  zoom = 1,
  maximized = false,
): {
  window: CardWindow;
  sidebar: { sizePx: number; hidden: boolean };
  panel: { sizePx: number; hidden: boolean };
} => ({
  window: { width, height, maximized, zoom },
  sidebar: { sizePx: 268, hidden: false },
  panel: { sizePx: 368, hidden: panelHidden },
});

const heightAt =
  (card: CardText) =>
  (width: number): number =>
    cardHeight(card, width);

const listHeightAt =
  (rows: readonly AskRow[]) =>
  (width: number): number =>
    listHeight(rows, width);

describe('moreText', () => {
  test('counts one ask and several asks', () => {
    expect(moreText({ count: 1, space: 'Hill-climb' })).toBe('1 more ask in Hill-climb');
    expect(moreText({ count: 2, space: 'Hill-climb' })).toBe('2 more asks in Hill-climb');
  });
});

describe('cardHeight', () => {
  test('grows with the command and the more line', () => {
    const base = cardHeight({ ...text, command: null }, askCardSize.maximumWidth);

    expect(cardHeight(text, askCardSize.maximumWidth)).toBeGreaterThan(base);

    expect(
      cardHeight({ ...text, more: '1 more ask in X' }, askCardSize.maximumWidth),
    ).toBeGreaterThan(cardHeight(text, askCardSize.maximumWidth));
  });
});

describe('listHeight', () => {
  test('adds a row for each ask and a line for a command', () => {
    const one = listHeight([row()], askCardSize.maximumWidth);

    const two = listHeight(
      [row(), row({ identity: 't2:question:x' }, 'tau', '5m')],
      askCardSize.maximumWidth,
    );

    expect(two).toBeGreaterThan(one);
    expect(one).toBeGreaterThan(listHeight([row({ command: null })], askCardSize.maximumWidth));
  });

  test('grows when a question wraps in a narrower card', () => {
    const long = { question: 'a'.repeat(400) };
    const wide = listHeight([row(long)], askCardSize.maximumWidth);
    const narrow = listHeight([row(long)], 200);

    expect(narrow).toBeGreaterThan(wide);
  });
});

describe('cardGeometry', () => {
  test('centers the card in the main column and leaves the clearance above the pane bottom', () => {
    const geometry = cardGeometry(sources(1280, 820), heightAt(text));
    const height = cardHeight(text, askCardSize.maximumWidth);

    expect(geometry.width).toBe(askCardSize.maximumWidth);
    expect(geometry.height).toBe(height);

    expect(geometry.at).toEqual({
      x: 564,
      y: 820 - spacing.small - askCardSize.paneClearance - height,
    });
  });

  test('keeps the main column between the sidebar and a shown panel', () => {
    const geometry = cardGeometry(sources(1280, 820, false), heightAt(text));

    expect(geometry.at?.x).toBe(268 + (1280 - 268 - 368 - askCardSize.maximumWidth) / 2);
  });

  test('shrinks the card to the main column less its two insets', () => {
    const geometry = cardGeometry(sources(640, 820), heightAt(text));

    expect(geometry.width).toBe(640 - 268 - 2 * askCardSize.paneClearance);
  });

  test('places the card in physical pixels at a non-default zoom', () => {
    const geometry = cardGeometry(sources(2560, 1640, true, 2), heightAt(text));
    const height = cardHeight(text, askCardSize.maximumWidth);

    expect(geometry.width).toBe(askCardSize.maximumWidth);

    expect(geometry.at).toEqual({
      x: (268 + (1280 - 268 - askCardSize.maximumWidth) / 2) * 2,
      y: 1640 - (spacing.small + askCardSize.paneClearance + height) * 2,
    });
  });

  test('opens centered when the window size is unknown', () => {
    const geometry = cardGeometry({ ...sources(0, 0), window: null }, heightAt(text));

    expect(geometry.at).toBeNull();
    expect(geometry.width).toBe(askCardSize.maximumWidth);
  });

  test('opens centered when the window is maximized and its bounds are stale', () => {
    const geometry = cardGeometry(sources(1280, 820, true, 1, true), heightAt(text));

    expect(geometry.at).toBeNull();
  });
});

describe('cardSignature', () => {
  test('changes when the geometry changes and stays the same for identical inputs', () => {
    const geometry = cardGeometry(sources(1280, 820), heightAt(text));
    const content = { text, rows: null };
    const signature = cardSignature(ask, content, geometry);
    const moved = cardSignature(ask, content, { ...geometry, at: { x: 1, y: 2 } });

    expect(cardSignature(ask, content, { ...geometry })).toBe(signature);
    expect(moved).not.toBe(signature);
  });

  test('changes when a listed ask shows another age', () => {
    const rows = [row(), row({ identity: 't2:question:x' }, 'tau', '5m')];
    const geometry = cardGeometry(sources(1280, 820), listHeightAt(rows));
    const signature = cardSignature(ask, { text, rows }, geometry);

    const aged = [row({}, 'koja', '3m'), row({ identity: 't2:question:x' }, 'tau', '5m')];
    const agedGeometry = cardGeometry(sources(1280, 820), listHeightAt(aged));

    expect(cardSignature(ask, { text, rows: aged }, agedGeometry)).not.toBe(signature);
  });
});

describe('windowBoundsOf', () => {
  test('reads the width and height from the window bounds', () => {
    expect(windowBoundsOf({ state: 'windowed', bounds: [0, 0, 1280, 820] })).toEqual({
      width: 1280,
      height: 820,
      maximized: false,
    });
  });

  test('marks maximized and fullscreen bounds as stale', () => {
    expect(windowBoundsOf({ state: 'maximized', bounds: [0, 0, 1280, 820] })?.maximized).toBe(true);

    expect(windowBoundsOf({ state: 'fullscreen', bounds: [0, 0, 1280, 820] })?.maximized).toBe(
      true,
    );
  });

  test('rejects a missing or empty size', () => {
    expect(windowBoundsOf(null)).toBeNull();
    expect(windowBoundsOf({ bounds: [0, 0] })).toBeNull();
    expect(windowBoundsOf({ bounds: [0, 0, 0, 820] })).toBeNull();
  });
});
