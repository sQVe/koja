import { describe, expect, mock, test } from 'bun:test';

interface Binding {
  section: string;
  keys: string;
  action: string;
}

let bindings: Binding[] = [];

await mock.module('herdr', () => ({ keys: (): Binding[] => bindings }));

const { shortcutFor } = await import('./shortcut.ts');

describe('shortcutFor', () => {
  test('returns the binding of the first action that has one', () => {
    bindings = [
      { section: 'global', keys: 'ctrl-shift-p', action: 'palette.open' },
      { section: 'global', keys: 'ctrl-p', action: 'picker.open' },
    ];

    expect(shortcutFor('picker.open', 'palette.open')).toBe('ctrl-p');
  });

  test('ignores bindings outside the global section', () => {
    bindings = [{ section: 'pane', keys: 'ctrl-p', action: 'picker.open' }];

    expect(shortcutFor('picker.open')).toBeNull();
  });

  test('answers null when no action has a binding', () => {
    bindings = [{ section: 'global', keys: 'ctrl-p', action: 'other.open' }];

    expect(shortcutFor('picker.open')).toBeNull();
  });
});
