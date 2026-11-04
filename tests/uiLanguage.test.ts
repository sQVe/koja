import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { iconNames } from '../src/kit/iconNames.ts';

interface SourceLine {
  path: string;
  line: number;
  text: string;
}

interface ThemeFile {
  ansi: string[];
  background?: string;
  colors: Record<string, string>;
}

interface ContrastPair {
  minimum: number;
  reason: string;
  surface: string;
  text: string;
}

interface ContrastResult {
  line: string;
  passed: boolean;
}

const kitDirectory = 'src/kit';
const modsDirectory = 'src/mods';
const themePath = 'config/themes/catppuccin-latte-muted.json';

const hardCodedColorPattern = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;

// The style methods that set a size, a spacing, a corner radius, or a text size. Zero is no size,
// such as `.min_h(0)`, which lets a flex child shrink.
const sizedMethods = [
  'size',
  'w',
  'h',
  'min_w',
  'max_w',
  'min_h',
  'max_h',
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'gap',
  'rounded',
  'text_size',
  'top',
  'bottom',
  'left',
  'right',
];

const sizedCallPattern = new RegExp(String.raw`\.(?:${sizedMethods.join('|')})\(\s*-?(?!0\b)\d`);

let colorFixture: string | null = null;

afterEach(async () => {
  if (colorFixture === null) {
    return;
  }

  await rm(colorFixture, { recursive: true, force: true });

  colorFixture = null;
});

const typeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true });

  return entries
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
    .map((entry) => join(directory, entry));
};

const sourceLines = async (directory: string): Promise<SourceLine[]> => {
  const files = await typeScriptFiles(directory);

  const contents = await Promise.all(
    files.map(async (path) => ({ path, text: await readFile(path, 'utf8') })),
  );

  return contents.flatMap(({ path, text }) =>
    text.split('\n').map((lineText, index) => ({ path, line: index + 1, text: lineText })),
  );
};

const isComment = (text: string): boolean => text.trimStart().startsWith('//');

const linesMatching = async (directory: string, pattern: RegExp): Promise<string[]> => {
  const lines = await sourceLines(directory);

  return lines
    .filter((line) => !isComment(line.text) && pattern.test(line.text))
    .map((line) => `${line.path}:${line.line}: ${line.text.trim()}`);
};

const paletteFromTheme = (theme: ThemeFile): Record<string, string> => {
  const palette: Record<string, string> = { ...theme.colors };

  if (theme.background !== undefined) {
    palette['background'] = theme.background;
  }

  theme.ansi.forEach((color, index) => {
    palette[`ansi${index}`] = color;
  });

  return palette;
};

const hexChannels = (color: string): [number, number, number] => {
  const hex = color.replace('#', '');

  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((digit) => `${digit}${digit}`)
          .join('')
      : hex.slice(0, 6);

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
};

const linearChannel = (channel: number): number => {
  const fraction = channel / 255;

  if (fraction <= 0.04045) {
    return fraction / 12.92;
  }

  return ((fraction + 0.055) / 1.055) ** 2.4;
};

const linearChannels = (color: string): [number, number, number] => {
  const channels = hexChannels(color);

  return [linearChannel(channels[0]), linearChannel(channels[1]), linearChannel(channels[2])];
};

const relativeLuminance = (color: string): number => {
  const [red, green, blue] = linearChannels(color);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (first: string, second: string): number => {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};

const contrastPair = (
  text: string,
  surface: string,
  minimum: number,
  reason: string,
): ContrastPair => ({ text, surface, minimum, reason });

const rowSurfaces = ['chrome', 'popover', 'hover', 'selected'];

const rowPairs = (): ContrastPair[] => {
  const pairs: ContrastPair[] = [];

  rowSurfaces.forEach((surface) => {
    pairs.push(contrastPair('foreground', surface, 4.5, `listRow and tab label on ${surface}`));
    pairs.push(contrastPair('muted', surface, 4.5, `listRow muted label on ${surface}`));

    pairs.push(
      contrastPair('dim', surface, 4.5, `listRow detail, icon, and key hint on ${surface}`),
    );

    pairs.push(
      contrastPair('ansi1', surface, 4.5, `diff removal and file status text on ${surface}`),
    );

    pairs.push(
      contrastPair('ansi2', surface, 4.5, `diff addition and file status text on ${surface}`),
    );

    pairs.push(contrastPair('working', surface, 3, `statusMark working on ${surface}`));
    pairs.push(contrastPair('done', surface, 3, `statusMark done on ${surface}`));
    pairs.push(contrastPair('idle', surface, 3, `statusMark idle on ${surface}`));
    pairs.push(contrastPair('border', surface, 3, `spaceMark empty status ring on ${surface}`));
  });

  pairs.push(contrastPair('blocked', 'chrome', 3, 'statusMark blocked on chrome'));

  pairs.push(
    contrastPair('blocked', 'popover', 4.5, 'fileStatusMark M text in koja-gallery on popover'),
  );

  pairs.push(contrastPair('blocked', 'hover', 4.5, 'fileStatusMark M text on hover'));
  pairs.push(contrastPair('blocked', 'selected', 4.5, 'fileStatusMark M text on selected'));

  pairs.push(
    contrastPair(
      'accent',
      'popover',
      4.5,
      'highlightedText match and focused textField outline on popover',
    ),
  );

  pairs.push(contrastPair('accent', 'hover', 4.5, 'highlightedText match on hover'));
  pairs.push(contrastPair('accent', 'selected', 4.5, 'highlightedText match on selected'));

  ['chrome', 'hover', 'selected'].forEach((surface) => {
    pairs.push(
      contrastPair('ansi5', surface, 4.5, `merged pull text in koja-spaces on ${surface}`),
    );
  });

  return pairs;
};

const backgroundPairs = (): ContrastPair[] => [
  contrastPair(
    'foreground',
    'background',
    4.5,
    'koja-pane title and koja-changes text on background',
  ),
  contrastPair('muted', 'background', 4.5, 'koja-pane unfocused title on background'),
  contrastPair('dim', 'background', 4.5, 'koja-pane folder and Changes detail on background'),
  contrastPair('ansi1', 'background', 4.5, 'Changes removal and file status text on background'),
  contrastPair('ansi2', 'background', 4.5, 'Changes addition and file status text on background'),
  contrastPair('blocked', 'background', 4.5, 'fileStatusMark M text on background'),
  contrastPair('working', 'background', 3, 'statusMark working in a pane header on background'),
  contrastPair('done', 'background', 3, 'statusMark done in a pane header on background'),
  contrastPair('accent', 'background', 3, 'focused textField outline on background'),
];

const contrastPairs = (): ContrastPair[] => [
  ...rowPairs(),
  ...backgroundPairs(),
  contrastPair('dim', 'raised', 4.5, 'koja-changes diff hunk header on raised'),
  contrastPair('solid_foreground', 'solid', 4.5, 'actionButton label on solid'),
  contrastPair('solid', 'popover', 3, 'actionButton fill on popover'),
  contrastPair('popover', 'ansi1', 4.5, 'dialogButton danger label on ansi1'),
  contrastPair('selected', 'popover', 3, 'active toggleButton fill on popover'),
  contrastPair('selected', 'chrome', 3, 'active toggleButton fill in koja-tabs on chrome'),
];

const knownFailures = [
  'dim on chrome',
  'ansi1 on chrome',
  'ansi2 on chrome',
  'dim on popover',
  'dim on hover',
  'dim on selected',
  'ansi1 on hover',
  'ansi1 on selected',
  'ansi2 on hover',
  'ansi2 on selected',
  'accent on hover',
  'accent on selected',
  'ansi5 on chrome',
  'ansi5 on hover',
  'ansi5 on selected',
  'idle on hover',
  'idle on selected',
  'working on selected',
  'blocked on hover',
  'blocked on selected',
  'dim on background',
  'ansi1 on background',
  'ansi2 on background',
  'blocked on background',
  'dim on raised',
  'solid_foreground on solid',
  'selected on popover',
  'selected on chrome',
  'border on chrome',
  'border on popover',
  'border on hover',
  'border on selected',
];

const contrastResult = (pair: ContrastPair, palette: Record<string, string>): ContrastResult => {
  const color = palette[pair.text];
  const surfaceColor = palette[pair.surface];

  if (color === undefined || surfaceColor === undefined) {
    throw new Error(`The palette has no ${pair.text} on ${pair.surface}`);
  }

  const ratio = contrastRatio(color, surfaceColor);
  const line = `${pair.text} on ${pair.surface}: ${ratio.toFixed(2)}:1, needs ${pair.minimum}:1`;

  return { line, passed: ratio >= pair.minimum };
};

describe('the UI language', () => {
  test('the kit and mods hold no hard-coded colors', async () => {
    const kitFailures = await linesMatching(kitDirectory, hardCodedColorPattern);
    const modFailures = await linesMatching(modsDirectory, hardCodedColorPattern);

    expect(kitFailures).toEqual([]);
    expect(modFailures).toEqual([]);
  });

  test('the color check names hard-coded hex and rgb() values with file and line', async () => {
    colorFixture = await mkdtemp(join(tmpdir(), 'koja-colors-'));

    await writeFile(join(colorFixture, 'hex.ts'), "export const shade = '#5858a0';\n");
    await writeFile(join(colorFixture, 'rgb.ts'), 'export const fill = rgb(20, 30, 40);\n');

    const failures = await linesMatching(colorFixture, hardCodedColorPattern);

    const expected = [
      `${join(colorFixture, 'hex.ts')}:1: export const shade = '#5858a0';`,
      `${join(colorFixture, 'rgb.ts')}:1: export const fill = rgb(20, 30, 40);`,
    ];

    expect(failures.toSorted()).toEqual(expected.toSorted());
  });

  test('the contrast check names a low-contrast pair with both tokens and its ratio', () => {
    const fixture = paletteFromTheme({
      ansi: [],
      colors: { foreground: '#888888', popover: '#ffffff' },
    });

    const pair = contrastPair('foreground', 'popover', 4.5, 'fixture pair');
    const result = contrastResult(pair, fixture);

    expect(result.passed).toBe(false);
    expect(result.line).toBe('foreground on popover: 3.54:1, needs 4.5:1');
  });

  test('the real theme fails contrast only for the known failures', async () => {
    const theme = JSON.parse(await readFile(themePath, 'utf8')) as ThemeFile;
    const palette = paletteFromTheme(theme);
    const pairs = contrastPairs();

    const failed = pairs
      .map((pair) => contrastResult(pair, palette))
      .filter((result) => !result.passed)
      .map((result) => result.line);

    const expected = knownFailures.map((key) => {
      const match = pairs.find((pair) => `${pair.text} on ${pair.surface}` === key);

      if (match === undefined) {
        throw new Error(`The known failure "${key}" is not a checked pair`);
      }

      return contrastResult(match, palette).line;
    });

    expect(failed.toSorted()).toEqual(expected.toSorted());
  });

  test('every checked contrast pair names its text and surface once', () => {
    const keys = contrastPairs().map((pair) => `${pair.text} on ${pair.surface}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every icon the kit names has a file, and every file is named', async () => {
    const files = await readdir(join(kitDirectory, 'icons'));
    const named = iconNames.map((name) => `${name}.svg`);

    expect(files.toSorted()).toEqual(named.toSorted());
  });

  test('mods draw icons only through the kit', async () => {
    const drawsOwnIcon = /\b(?:svg|image)\s*\(|import\s*\{[^}]*\b(?:svg|image)\b[^}]*\}\s*from/;

    expect(await linesMatching(modsDirectory, drawsOwnIcon)).toEqual([]);
  });

  test('mods name no asset of Herdr or of another mod', async () => {
    expect(await linesMatching(modsDirectory, /['"`](?:mods|frame|icons)\//)).toEqual([]);
  });

  test('mods take every size from the kit', async () => {
    expect(await linesMatching(modsDirectory, sizedCallPattern)).toEqual([]);
  });
});
