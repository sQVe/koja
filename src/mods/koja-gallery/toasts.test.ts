import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  click,
  clickablesWithText,
  descendants,
  drawnTexts,
  drawnTree,
  elementWithText,
} from '../../../tests/drawn.ts';
import { mockGalleryModules, sampleNamed } from '../../../tests/gallery.ts';
import type { ToastLevel } from '../../kit/toast/toastLevel.ts';
import { toastLevels } from '../../kit/toast/toastLevel.ts';

interface Notification {
  title: string;
  body?: string;
  level?: string;
  timeout?: number;
  action?: { name: string; args?: Record<string, unknown> };
}

const notifications: Notification[] = [];

const palette = {
  accent: '#a100aa',
  blocked: '#c0392b',
  done: '#1f8f4e',
  raised: '#101010',
  solid: '#202020',
  solid_foreground: '#303030',
  working: '#b7791f',
};

const levelMessages: Record<ToastLevel, { title: string; body: string; mark: string }> = {
  info: {
    title: 'Update available',
    body: 'Restart to install the new version.',
    mark: palette.accent,
  },
  success: { title: 'Build finished', body: 'All checks passed.', mark: palette.done },
  warning: {
    title: 'Checks are stale',
    body: 'The last check ran 8 minutes ago.',
    mark: palette.working,
  },
  error: { title: 'Build failed', body: 'typecheck exited with code 1.', mark: palette.blocked },
};

const levelSamples = toastLevels.map((level) => {
  const caption = `${level} toast`;
  const message = levelMessages[level];

  return { caption, title: message.title, body: message.body, mark: message.mark };
});

Object.assign(globalThis, { kojaModName: 'koja' });

const kitFake = await mockGalleryModules({
  notify: (notification: Notification) => {
    notifications.push(notification);

    return 'toast-1';
  },
  theme: () => palette,
});

await mock.module('../../kit/index.ts', () => kitFake);

const { toasts } = await import('./toasts.ts');

afterAll(() => {
  mock.restore();
});

const parts = (): DrawnElement[] => toasts() as unknown as DrawnElement[];

test('posts a notification with an action and a timeout', () => {
  const [button] = clickablesWithText(drawnTree(parts()), 'Post a notification');

  if (button === undefined) {
    throw new Error('The gallery draws no Post a notification button.');
  }

  click(button);

  expect(notifications).toHaveLength(1);
  expect(notifications[0]?.action).toEqual({ name: 'app.palette' });
  expect(notifications[0]?.timeout ?? 0).toBeGreaterThan(0);
});

test('draws each level as its own card with its message and mark', () => {
  for (const level of levelSamples) {
    const card = sampleNamed(parts(), level.caption);
    const backgrounds = descendants(card).flatMap((part) => part.backgroundColors);

    expect(drawnTexts(card)).toContain(level.title);
    expect(drawnTexts(card)).toContain(level.body);
    expect(backgrounds).toContain(level.mark);
  }
});

test('draws the icon sample with its icon and message', () => {
  const icon = sampleNamed(parts(), 'Icon instead of the level dot');
  const paths = descendants(icon).map((part) => part.path);

  expect(paths).toContain('mods/koja/icons/palette.svg');
  expect(drawnTexts(icon)).toContain('Update available');
  expect(drawnTexts(icon)).toContain('Restart to install the new version.');
});

test('draws the fitted two-line body in full and clips the fixed card to its first line', () => {
  const fitted = sampleNamed(parts(), 'Two-line body');
  const fixed = sampleNamed(parts(), 'Fixed height, as a notification shows');
  const bothLines = 'The first line of the body.\nThe second line of the body.';
  const firstLine = 'The first line of the body.';

  expect(drawnTexts(fitted)).toContain(bothLines);
  expect(drawnTexts(fixed)).toContain(firstLine);
  expect(drawnTexts(fixed)).not.toContain(bothLines);
});

test('fills the notification frame with the fixed card', () => {
  const fixed = sampleNamed(parts(), 'Fixed height, as a notification shows');
  const frame = descendants(fixed).find((part) => part.styles['h'] !== undefined);
  const card = frame?.kids.at(0);

  expect(card?.styles['size_full']).toBeDefined();
});

test('draws the login command with its Copy control enabled', () => {
  const login = sampleNamed(parts(), 'Machine login with a Copy button');
  const copy = elementWithText(login, 'Copy');

  expect(drawnTexts(login)).toContain('hc machine login devbox');
  expect(copy?.backgroundColors.at(-1)).toBe(palette.solid);
});
