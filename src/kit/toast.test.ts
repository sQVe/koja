import { afterAll, expect, mock, test } from 'bun:test';

import type { Element } from 'gpui-kit';

import type { DrawnElement } from '../../tests/drawn.ts';
import { descendants, drawn, drawnIcons, drawnTexts, elementWithText } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { ToastCardOptions } from './toast.ts';

const palette = {
  popover: '#111111',
  hover: '#222222',
  foreground: '#333333',
  dim: '#444444',
  accent: '#ff00aa',
};

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), image: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './toast.ts';

const { toastCard, toastCommandBody } = (await import(modulePath)) as {
  toastCard: (options: ToastCardOptions) => DrawnElement;
  toastCommandBody: (command: string, action: Element) => DrawnElement;
};

const { div } = (await import('gpui-kit')) as { div: () => Element };

afterAll(() => {
  mock.restore();
});

const options: ToastCardOptions = {
  id: 'toast',
  level: 'info',
  icon: null,
  title: 'Update available',
  body: 'Restart to install the new version.',
  fitHeight: true,
};

const twoLineBody = 'The first line of the body.\nThe second line of the body.';

const hasBackground = (card: DrawnElement, color: string): boolean =>
  descendants(card).some((part) => part.backgroundColors.includes(color));

const hasStyle = (card: DrawnElement, style: string): boolean =>
  descendants(card).some((part) => part.styles[style] !== undefined);

test('shows the icon instead of the level dot', () => {
  const withIcon = toastCard({ ...options, icon: '/x.png' });
  const withDot = toastCard(options);

  expect(drawnIcons(withIcon)).toEqual(['x.png']);
  expect(hasBackground(withIcon, palette.accent)).toBe(false);
  expect(drawnIcons(withDot)).toEqual([]);
  expect(hasBackground(withDot, palette.accent)).toBe(true);
});

test('draws both body lines when the card fits its height', () => {
  const card = toastCard({ ...options, body: twoLineBody, fitHeight: true });

  expect(drawnTexts(card)).toContain(twoLineBody);
});

test('draws only the first body line when the card fills the overlay', () => {
  const card = toastCard({ ...options, body: twoLineBody, fitHeight: false });
  const texts = drawnTexts(card);

  expect(texts).toContain('The first line of the body.');
  expect(texts).not.toContain('The second line of the body.');
});

test('cuts a CRLF body at the line break without the carriage return', () => {
  const body = 'The first line.\r\nThe second line.';
  const card = toastCard({ ...options, body, fitHeight: false });
  const texts = drawnTexts(card);

  expect(texts).toContain('The first line.');
  expect(texts).not.toContain('The first line.\r');
});

test('truncates the title and body only when the card fills the overlay', () => {
  const fitted = toastCard({ ...options, body: twoLineBody, fitHeight: true });
  const fixed = toastCard({ ...options, body: twoLineBody, fitHeight: false });

  const fittedTitle = elementWithText(fitted, options.title);
  const fittedBody = elementWithText(fitted, twoLineBody);
  const fixedTitle = elementWithText(fixed, options.title);
  const fixedBody = elementWithText(fixed, 'The first line of the body.');

  expect(fittedTitle?.styles['truncate']).toBeUndefined();
  expect(fittedBody?.styles['truncate']).toBeUndefined();
  expect(fixedTitle?.styles['truncate']).toBeDefined();
  expect(fixedBody?.styles['truncate']).toBeDefined();
});

test('fills the overlay for a fixed card and fits a fitted card to its content', () => {
  const fitted = toastCard({ ...options, fitHeight: true });
  const fixed = toastCard({ ...options, fitHeight: false });

  expect(hasStyle(fitted, 'size_full')).toBe(false);
  expect(hasStyle(fitted, 'py')).toBe(true);
  expect(hasStyle(fixed, 'size_full')).toBe(true);
  expect(hasStyle(fixed, 'py')).toBe(false);
});

test('keeps the full command on the truncated login text', () => {
  const copy = div().child('Copy');
  const body = toastCommandBody('hc machine login devbox', copy);
  const command = elementWithText(body, 'hc machine login devbox');

  expect(command?.styles['truncate']).toBeDefined();
  expect(command?.tooltipText).toBe('hc machine login devbox');
});

test('draws no body when the body is null', () => {
  const card = toastCard({ ...options, body: null });

  expect(drawnTexts(card)).toEqual([options.title]);
});

test('draws a string body', () => {
  const card = toastCard({ ...options, body: 'Restart to install the new version.' });

  expect(drawnTexts(card)).toContain('Restart to install the new version.');
});

test('draws an Element body as given', () => {
  const body = div().child('Element body');
  const card = toastCard({ ...options, body });

  expect(drawnTexts(card)).toContain('Element body');
});
