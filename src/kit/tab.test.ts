import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnIcons, elementWithIcon } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { AttentionStatus } from './attentionStatus.ts';

interface TabOptions {
  label: string;
  active: boolean;
  hovered?: boolean;
  icon: DrawnElement | null;
  status: AttentionStatus | null;
  close: DrawnElement | null;
}

const themeColors = {
  foreground: '#111111',
  muted: '#222222',
  selected: '#333333',
  border: '#444444',
  hover: '#555555',
  dim: '#666666',
  blocked: '#777777',
  working: '#888888',
  done: '#999999',
};

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => themeColors }));

const modulePath = './tab.ts';

const loaded = (await import(modulePath)) as {
  tab: (options: TabOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const iconName = 'terminal.svg';

const drawnTab = (
  status: AttentionStatus | null,
  active = false,
  hovered?: boolean,
  close: DrawnElement | null = null,
): DrawnElement =>
  loaded.tab({
    label: 'koja',
    active,
    ...(hovered === undefined ? {} : { hovered }),
    icon: drawn(iconName),
    status,
    close,
  });

const drawnIcon = (active: boolean, hovered?: boolean): DrawnElement | null =>
  elementWithIcon(drawnTab(null, active, hovered), iconName);

describe('tab icon color', () => {
  test('the icon takes the foreground color when the tab is active', () => {
    expect(drawnIcon(true)?.textColors).toContain(themeColors.foreground);
  });

  test('the icon takes the foreground color when the tab is hovered', () => {
    expect(drawnIcon(false, true)?.textColors).toContain(themeColors.foreground);
  });

  test('the icon takes the muted color otherwise', () => {
    const icon = drawnIcon(false);

    expect(icon?.textColors).toContain(themeColors.muted);
    expect(icon?.textColors).not.toContain(themeColors.foreground);
  });
});

describe('tab attention mark', () => {
  test('a blocked tab leads with the question bubble and draws no program icon', () => {
    const tab = drawnTab('blocked');

    expect(drawnIcons(tab)[0]).toBe('message-circle-question.svg');
    expect(elementWithIcon(tab.kids[0] ?? drawn(), 'message-circle-question.svg')).not.toBeNull();

    expect(elementWithIcon(tab, 'message-circle-question.svg')?.textColors).toEqual([
      themeColors.blocked,
    ]);

    expect(drawnIcons(tab)).not.toContain(iconName);
  });

  test('a done tab leads with the check and draws no program icon', () => {
    const tab = drawnTab('done');

    expect(drawnIcons(tab)[0]).toBe('check.svg');
    expect(elementWithIcon(tab.kids[0] ?? drawn(), 'check.svg')).not.toBeNull();
    expect(elementWithIcon(tab, 'check.svg')?.textColors).toEqual([themeColors.done]);
    expect(drawnIcons(tab)).not.toContain(iconName);
  });

  test('a working tab leads with the spinner and draws no program icon', () => {
    const tab = drawnTab('working');

    expect(drawnIcons(tab)[0]).toBe('loader-circle.svg');
    expect(elementWithIcon(tab, 'loader-circle.svg')?.textColors).toEqual([themeColors.working]);
    expect(drawnIcons(tab)).not.toContain(iconName);
  });

  test('a crashed tab leads with the triangle alert and draws no program icon', () => {
    const tab = drawnTab('crashed');

    expect(drawnIcons(tab)[0]).toBe('triangle-alert.svg');
    expect(elementWithIcon(tab, 'triangle-alert.svg')?.textColors).toEqual([themeColors.blocked]);
    expect(drawnIcons(tab)).not.toContain(iconName);
  });

  test('an idle tab keeps its program icon and draws no mark', () => {
    const tab = drawnTab('idle');

    expect(drawnIcons(tab)).toEqual([iconName]);
  });

  test('a tab with no status keeps its program icon', () => {
    expect(drawnIcons(drawnTab(null))).toEqual([iconName]);
  });

  test('an active tab draws one leading mark and its close button in the end slot', () => {
    const close = drawn('x.svg');
    const tab = drawnTab('blocked', true, undefined, close);
    const leadingSlot = tab.kids[0] ?? drawn();
    const endSlot = tab.kids.at(-1);
    const marks = drawnIcons(tab).filter((name) => name === 'message-circle-question.svg');

    expect(elementWithIcon(leadingSlot, 'message-circle-question.svg')).not.toBeNull();
    expect(marks).toHaveLength(1);
    expect(endSlot?.kids).toEqual([close]);
  });
});
