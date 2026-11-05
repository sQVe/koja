import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, elementWithIcon } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface TabOptions {
  label: string;
  active: boolean;
  hovered?: boolean;
  icon: DrawnElement;
  status: null;
  close: null;
}

const themeColors = {
  foreground: '#111111',
  muted: '#222222',
  selected: '#333333',
  border: '#444444',
  hover: '#555555',
  dim: '#666666',
  blocked: '#777777',
};

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => themeColors }));

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const modulePath = './tab.ts';

const loaded = (await import(modulePath)) as {
  tab: (options: TabOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const iconName = 'terminal.svg';

// The icon as the drawn tab shows it, so a tab that drops its icon fails the test.
const drawnIcon = (active: boolean, hovered?: boolean): DrawnElement | null => {
  const drawnTab = loaded.tab({
    label: 'koja',
    active,
    ...(hovered === undefined ? {} : { hovered }),
    icon: drawn(iconName),
    status: null,
    close: null,
  });

  return elementWithIcon(drawnTab, iconName);
};

describe('tab', () => {
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
