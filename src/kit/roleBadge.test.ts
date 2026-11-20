import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { badgeSize, paneHeaderWidth } from './size.ts';

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({ theme: () => ({ ansi4: '#00ff00', foreground: '#000000' }) }),
);

const modulePath = './roleBadge.ts';

const builtInRoles = [
  'lead',
  'architect',
  'worker',
  'scout',
  'reviewer',
  'checker',
  'qa',
  'browser',
] as const;

const { roleBadge, roleToken } = (await import(modulePath)) as {
  roleBadge: (role: string) => DrawnElement;
  roleToken: (role: string) => string;
};

afterAll(() => {
  mock.restore();
});

describe('roleBadge', () => {
  test('the role badge color follows the kind of work', () => {
    expect(roleToken('architect')).toBe('ansi4');
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

  test('a long role label cuts at the badge cap and keeps its full text on hover', () => {
    const badge = roleBadge('integration-test-runner');
    const [label] = badge.kids;

    expect(drawnTexts(badge)).toEqual(['integration-test-runner']);
    expect(label?.styles['min_w']).toEqual([0]);
    expect(label?.styles['max_w']).toEqual([badgeSize.maxLabelWidth]);
    expect(label?.styles['truncate']).toEqual([]);
    expect(badge.tooltipText).toBe('integration-test-runner');
  });

  test('every built-in role fits inside the badge cap', () => {
    const tooWide = builtInRoles.filter(
      (role) => role.length * paneHeaderWidth.glyph > badgeSize.maxLabelWidth,
    );

    expect(tooWide).toEqual([]);
  });

  test('the badge draws the role as outlined text in its color', () => {
    const badge = roleBadge('architect');
    const [label] = badge.kids;

    expect(drawnTexts(badge)).toEqual(['architect']);
    expect(badge.backgroundColors).toEqual([]);
    expect(badge.borderColors).toEqual(['#00ff00']);
    expect(label?.textColors).toEqual(['#00ff00']);
  });
});
