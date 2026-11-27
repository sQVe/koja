import { describe, expect, test } from 'bun:test';

import { readSidebarView } from './sidebarView.ts';

describe('readSidebarView', () => {
  test('an unknown stored view reads as Projects', () => {
    expect(readSidebarView(null)).toBe('projects');
    expect(readSidebarView('')).toBe('projects');
    expect(readSidebarView('map')).toBe('projects');
    expect(readSidebarView('inbox')).toBe('inbox');
  });
});
