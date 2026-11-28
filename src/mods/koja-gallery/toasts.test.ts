import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  click,
  clickablesWithText,
  descendants,
  drawnIcons,
  drawnTexts,
  drawnTree,
  elementWithText,
  numberStyle,
} from '../../../tests/drawn.ts';
import { mockGalleryModules } from '../../../tests/gallery.ts';
import { toastSize } from '../../kit/size.ts';

interface Notification {
  title: string;
  body?: string;
  level?: string;
  timeout?: number;
  action?: { name: string; args?: Record<string, unknown> };
}

const notifications: Notification[] = [];

const palette = {
  raised: '#101010',
  solid: '#202020',
  solid_foreground: '#303030',
};

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

test('posts a notification with an action and a timeout', () => {
  const parts = toasts() as unknown as DrawnElement[];
  const [button] = clickablesWithText(drawnTree(parts), 'Post a notification');

  if (button === undefined) {
    throw new Error('The gallery draws no Post a notification button.');
  }

  click(button);

  expect(notifications).toHaveLength(1);
  expect(notifications[0]?.action?.name).toBeTruthy();
  expect(notifications[0]?.timeout ?? 0).toBeGreaterThan(0);
});

const sampleNamed = (label: string): DrawnElement => {
  const parts = toasts() as unknown as DrawnElement[];
  const found = parts.find((part) => drawnTexts(part).includes(label));

  if (found === undefined) {
    throw new Error(`The gallery has no sample named ${label}.`);
  }

  return found;
};

test('draws every level with its message', () => {
  const texts = drawnTexts(drawnTree(toasts() as unknown as DrawnElement[]));

  for (const title of ['Update available', 'Build finished', 'Checks are stale', 'Build failed']) {
    expect(texts).toContain(title);
  }

  expect(texts).toContain('All checks passed.');
});

test('draws the icon sample with its icon and message', () => {
  const icon = sampleNamed('Icon instead of the level dot');

  expect(drawnIcons(icon)).toEqual(['palette.svg']);
  expect(drawnTexts(icon)).toContain('Update available');
  expect(drawnTexts(icon)).toContain('Restart to install the new version.');
});

test('draws the fitted two-line body in full and clips the fixed card to its first line', () => {
  const fitted = sampleNamed('Two-line body');
  const fixed = sampleNamed('Fixed height, as a notification shows');
  const bothLines = 'The first line of the body.\nThe second line of the body.';
  const firstLine = 'The first line of the body.';

  expect(drawnTexts(fitted)).toContain(bothLines);
  expect(drawnTexts(fixed)).toContain(firstLine);
  expect(drawnTexts(fixed)).not.toContain(bothLines);
});

test('frames the fixed sample at the notification window size', () => {
  const fixed = sampleNamed('Fixed height, as a notification shows');
  const frame = descendants(fixed).find((part) => part.styles['h'] !== undefined);

  expect(numberStyle(frame, 'w')).toBe(toastSize.width);
  expect(numberStyle(frame, 'h')).toBe(toastSize.windowHeight);
});

test('draws the login command with its Copy control enabled', () => {
  const login = sampleNamed('Machine login with a Copy button');
  const copy = elementWithText(login, 'Copy');

  expect(drawnTexts(login)).toContain('hc machine login devbox');
  expect(copy?.backgroundColors.at(-1)).toBe(palette.solid);
});
