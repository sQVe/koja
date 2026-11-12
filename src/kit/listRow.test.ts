import { afterAll, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface RecordedElement {
  hoverLook: RecordedElement | null;
  styles: Record<string, unknown>;
}

interface RowOptions {
  size: 'small' | 'large';
  inset: boolean;
  state: 'normal' | 'selected' | 'disabled';
  label: string;
  hovered?: boolean;
  cursor?: boolean;
}

// Records every style method by name, last call wins, and applies a hover look to a fresh element
// so a test can read the runtime hover style.
const recorded = (): RecordedElement => {
  const element: RecordedElement = { hoverLook: null, styles: {} };

  const handle: RecordedElement = new Proxy(element, {
    get: (target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key === 'hover') {
        return (look: (element: RecordedElement) => RecordedElement) => {
          element.hoverLook = look(recorded());

          return handle;
        };
      }

      if (key in target) {
        return target[key as keyof RecordedElement];
      }

      return (...args: unknown[]) => {
        element.styles[String(key)] = args[0];

        return handle;
      };
    },
  });

  return handle;
};

const palette = {
  accent: '#1a1a2a',
  dim: '#2b2b3b',
  foreground: '#3c3c4c',
  muted: '#4d4d5d',
  selected: '#5e5e6e',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => recorded() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => recorded() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const modulePath = './listRow.ts';

const { listRow } = (await import(modulePath)) as {
  listRow: (options: RowOptions) => RecordedElement;
};

afterAll(() => {
  mock.restore();
});

const row = (options: Partial<RowOptions>): RecordedElement =>
  listRow({ size: 'small', inset: true, state: 'normal', label: 'row', ...options });

describe('listRow', () => {
  test('a row at rest draws no visible outline and hovers to a selected outline', () => {
    const element = row({});

    expect(element.styles['border_color']).not.toBe(palette.selected);
    expect(element.styles['border_color']).not.toBe(palette.accent);
    expect(element.hoverLook?.styles['border_color']).toBe(palette.selected);
    expect(element.styles['bg']).toBeUndefined();
  });

  test('a hovered row draws the selected outline', () => {
    expect(row({ hovered: true }).styles['border_color']).toBe(palette.selected);
  });

  test('a selected row draws the selected fill and no hover look', () => {
    const element = row({ state: 'selected' });

    expect(element.styles['bg']).toBe(palette.selected);
    expect(element.hoverLook).toBeNull();
  });

  test('a cursor row draws the accent outline, and hover does not replace it', () => {
    const element = row({ cursor: true });

    expect(element.styles['border_color']).toBe(palette.accent);
    expect(element.hoverLook).toBeNull();
    expect(row({ cursor: true, hovered: true }).styles['border_color']).toBe(palette.accent);
  });

  test('a selected cursor row keeps its fill under the accent outline', () => {
    const element = row({ cursor: true, state: 'selected' });

    expect(element.styles['bg']).toBe(palette.selected);
    expect(element.styles['border_color']).toBe(palette.accent);
  });

  test('a disabled cursor row draws the accent outline', () => {
    expect(row({ cursor: true, state: 'disabled' }).styles['border_color']).toBe(palette.accent);
  });

  test('a cursor row draws its outline in the border every row has', () => {
    expect(row({ cursor: true }).styles['border']).toBe(row({}).styles['border']);
  });

  test('a cursor row that is not inset keeps its square corners', () => {
    const element = row({ cursor: true, inset: false });

    expect(element.styles['border_color']).toBe(palette.accent);
    expect(element.styles['rounded']).toBeUndefined();
  });
});
