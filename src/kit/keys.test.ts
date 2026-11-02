import { describe, expect, test } from 'bun:test';

import { formatKeys } from './keys.ts';

describe('formatKeys', () => {
  test('names modifiers in a fixed order, joined by plus', () => {
    expect(formatKeys('shift-ctrl-t', 'linux')).toBe('Ctrl+Shift+T');
  });

  test('uses symbols without separators on macOS', () => {
    expect(formatKeys('ctrl-shift-p', 'macos')).toBe('⌃⇧P');
  });

  test('reads a trailing dash as the minus key', () => {
    expect(formatKeys('ctrl--', 'linux')).toBe('Ctrl+-');
  });

  test('capitalizes named keys', () => {
    expect(formatKeys('ctrl-PAGEDOWN', 'linux')).toBe('Ctrl+Pagedown');
  });

  test('adds shift for an upper-case letter', () => {
    expect(formatKeys('alt-K', 'windows')).toBe('Alt+Shift+K');
  });

  test('maps secondary to the platform command key', () => {
    expect(formatKeys('secondary-k', 'macos')).toBe('⌘K');
    expect(formatKeys('secondary-k', 'linux')).toBe('Ctrl+K');
  });

  test('formats each stroke of a sequence', () => {
    expect(formatKeys('  ctrl-k  ctrl-s ', 'linux')).toBe('Ctrl+K Ctrl+S');
  });
});
