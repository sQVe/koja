import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({
    theme: () => ({
      ansi4: '#00ff00',
      ansi6: '#1b5e57',
      background: '#ffffff',
      foreground: '#000000',
    }),
  }),
);

const modulePath = './roleBadge.ts';

const { roleBadge, roleToken } = (await import(modulePath)) as {
  roleBadge: (role: string, state?: 'full' | 'cut') => DrawnElement;
  roleToken: (role: string) => string;
};

afterAll(() => {
  mock.restore();
});

describe('roleBadge', () => {
  test('the role badge color follows the kind of work', () => {
    expect(roleToken('architect')).toBe('ansi6');
    expect(roleToken('lead')).toBe('ansi4');
    expect(roleToken('worker')).toBe('ansi2');
    expect(roleToken('reviewer')).toBe('ansi3');
    expect(roleToken('qa')).toBe('ansi5');
  });

  test('an unknown role gets the neutral color', () => {
    expect(roleToken('planner')).toBe('muted');
  });

  test('an inherited object name gets the neutral color', () => {
    expect(roleToken('constructor')).toBe('muted');
    expect(roleToken('toString')).toBe('muted');
    expect(roleToken('__proto__')).toBe('muted');
  });

  test('a cut role badge keeps its full text on hover', () => {
    const badge = roleBadge('integration-test-runner', 'cut');
    const [label] = badge.kids;

    expect(drawnTexts(badge)).toEqual(['integration-test-runner']);
    expect(badge.tooltipText).toBe('integration-test-runner');
    expect(label?.styles['min_w']).toEqual([0]);
    expect(label?.styles['truncate']).toEqual([]);
    expect(label?.styles['max_w']).toBeUndefined();
    expect(badge.styles['flex_initial']).toEqual([]);
    expect(badge.styles['min_w']).toEqual([0]);
  });

  test('a full role badge shows its whole label', () => {
    const badge = roleBadge('integration-test-runner', 'full');
    const [label] = badge.kids;

    expect(badge.tooltipText).toBe('integration-test-runner');
    expect(badge.styles['flex_none']).toEqual([]);
    expect(badge.styles['min_w']).toBeUndefined();
    expect(label?.styles['max_w']).toBeUndefined();
  });

  test('the role badge fills and outlines in the role color', () => {
    const badge = roleBadge('architect');

    expect(drawnTexts(badge)).toEqual(['architect']);
    expect(badge.backgroundColors).toEqual(['#1b5e57']);
    expect(badge.borderColors).toEqual(['#1b5e57']);
  });

  test('a dark fill gets light label text', () => {
    const [label] = roleBadge('architect').kids;

    expect(label?.textColors).toEqual(['#ffffff']);
  });

  test('a light fill keeps its fill and dark label text', () => {
    const badge = roleBadge('lead');
    const [label] = badge.kids;

    expect(badge.backgroundColors).toEqual(['#00ff00']);
    expect(badge.borderColors).toEqual(['#00ff00']);
    expect(label?.textColors).toEqual(['#000000']);
  });
});
