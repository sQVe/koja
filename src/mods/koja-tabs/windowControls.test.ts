import { describe, expect, test } from 'bun:test';

import { windowControls } from './windowControls.ts';

describe('windowControls', () => {
  test('shows nothing when Herdr draws the window buttons itself', () => {
    expect(windowControls({ buttons: false, maximized: false })).toEqual([]);
    expect(windowControls(null)).toEqual([]);
  });

  test('shows minimize, maximize, then close when Herdr draws none', () => {
    const controls = windowControls({ buttons: true, maximized: false });

    expect(controls.map((control) => control.command)).toEqual([
      'window.minimize',
      'window.maximize',
      'window.close',
    ]);
  });

  test('shows the restore icon while the window is maximized', () => {
    const restore = windowControls({ buttons: true, maximized: true }).find(
      (control) => control.command === 'window.maximize',
    );

    const maximize = windowControls({ buttons: true, maximized: false }).find(
      (control) => control.command === 'window.maximize',
    );

    expect(restore?.icon).toBe('copy');
    expect(maximize?.icon).toBe('square');
  });
});
