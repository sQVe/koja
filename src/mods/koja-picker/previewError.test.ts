import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, clickablesWithText, drawn, drawnIcons } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';

const palette = {
  blocked: '#c0392b',
  border: '#999ca7',
  dim: '#525460',
  foreground: '#1e2028',
  muted: '#3a3d4c',
  popover: '#dcdee5',
  raised: '#e6e8eb',
  solid: '#1e2028',
  solid_foreground: '#dcdee5',
} as const;

Object.assign(globalThis, { kojaModName: 'koja-picker' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

await mock.module('../../kit/index.ts', () =>
  realKitIndexFake(['button', 'icon', 'palette', 'size', 'stateLine', 'text', 'textRole', 'theme']),
);

const modulePath = './previewError.ts';

const { previewError } = (await import(modulePath)) as {
  previewError: (options: { enabled: boolean; onRetry: (cx: unknown) => void }) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('previewError', () => {
  test('shows an error line whose Retry starts the preview again', () => {
    let retries = 0;

    const element = previewError({
      enabled: true,
      onRetry: () => {
        retries += 1;
      },
    });

    expect(drawnIcons(element)).toContain('circle-alert.svg');

    const retry = clickablesWithText(element, 'Retry').at(0);

    expect(retry).toBeDefined();

    if (retry !== undefined) {
      click(retry);
    }

    expect(retries).toBe(1);
  });

  test('draws a Retry that takes no click while an attempt runs', () => {
    const element = previewError({ enabled: false, onRetry: () => undefined });

    expect(clickablesWithText(element, 'Retry')).toEqual([]);
  });
});
