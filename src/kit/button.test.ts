import { afterAll, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface RecordedElement {
  hover: RecordedElement | null;
  styles: Record<string, unknown>;
}

// Records every style method by name, last call wins, and applies a hover look to a fresh element
// so a test can read the runtime hover style.
const recorded = (): RecordedElement => {
  const element: RecordedElement = { hover: null, styles: {} };

  const handle: RecordedElement = new Proxy(element, {
    get: (target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key === 'hover') {
        if (element.hover !== null) {
          return element.hover;
        }

        return (look: (element: RecordedElement) => RecordedElement) => {
          element.hover = look(recorded());

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
  ansi1: '#2a2a3a',
  foreground: '#3b3b4b',
  muted: '#4c4c5c',
  popover: '#5d5d6d',
  raised: '#6e6e7e',
  solid: '#7f7f8f',
  solid_foreground: '#90909f',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => recorded() }));

await mock.module('gpui-kit', () => gpuiKitFake());

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const modulePath = './button.ts';

const { actionButton, dialogButton } = (await import(modulePath)) as {
  actionButton: (options: {
    enabled: boolean;
    hovered?: boolean;
    label: string;
  }) => RecordedElement;
  dialogButton: (options: {
    hovered?: boolean;
    kind: 'danger' | 'solid';
    label: string;
  }) => RecordedElement;
};

afterAll(() => {
  mock.restore();
});

const opacityOf = (element: RecordedElement): unknown => element.styles['opacity'];

describe('actionButton', () => {
  test('a hovered enabled button keeps its fill and label and draws a foreground border', () => {
    const button = actionButton({ enabled: true, hovered: true, label: 'Commit' });

    expect(button.styles['bg']).toBe(palette.solid);
    expect(button.styles['text_color']).toBe(palette.solid_foreground);
    expect(button.styles['border_color']).toBe(palette.foreground);
    expect(opacityOf(button)).toBeUndefined();
  });

  test('an enabled button at rest draws its border in its fill, and hovers to a foreground ring', () => {
    const button = actionButton({ enabled: true, label: 'Commit' });

    expect(button.styles['border_color']).toBe(palette.solid);
    expect(button.hover?.styles['border_color']).toBe(palette.foreground);
    expect(button.hover?.styles['opacity']).toBeUndefined();
  });

  test('a disabled button keeps the same hairline border as an enabled one, in its fill', () => {
    const enabled = actionButton({ enabled: true, label: 'Commit' });
    const disabled = actionButton({ enabled: false, label: 'Commit' });

    expect(disabled.styles['border']).toBe(enabled.styles['border']);
    expect(disabled.styles['border_color']).toBe(palette.raised);
  });
});

describe('dialogButton', () => {
  test('a hovered solid button keeps its fill and label and draws a foreground border', () => {
    const button = dialogButton({ hovered: true, kind: 'solid', label: 'Save' });

    expect(button.styles['bg']).toBe(palette.solid);
    expect(button.styles['text_color']).toBe(palette.solid_foreground);
    expect(button.styles['border_color']).toBe(palette.foreground);
    expect(opacityOf(button)).toBeUndefined();
  });

  test('a hovered danger button keeps its fill and label and draws a foreground border', () => {
    const button = dialogButton({ hovered: true, kind: 'danger', label: 'Close' });

    expect(button.styles['bg']).toBe(palette.ansi1);
    expect(button.styles['text_color']).toBe(palette.popover);
    expect(button.styles['border_color']).toBe(palette.foreground);
    expect(opacityOf(button)).toBeUndefined();
  });
});
