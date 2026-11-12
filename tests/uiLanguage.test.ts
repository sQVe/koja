import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { iconNames } from '../src/kit/iconNames.ts';
import { badgeFillAlpha, diffFillAlpha, normalFocusFillAlpha } from '../src/kit/palette.ts';
import { isRawStyleExempt, modsDirectory, typeScriptFiles } from './sourceFiles.ts';

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

interface Fill {
  alpha: string;
  token: string;
}

interface ContrastPair {
  fill?: Fill;
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

const styleLinesMatching = async (pattern: RegExp): Promise<string[]> => {
  const lines = await linesMatching(modsDirectory, pattern);

  return lines.filter((line) => !isRawStyleExempt(line));
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

const filledPair = (
  text: string,
  fill: Fill,
  surface: string,
  minimum: number,
  reason: string,
): ContrastPair => ({ text, fill, surface, minimum, reason });

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

  pairs.push(
    contrastPair(
      'accent',
      'selected',
      4.5,
      'highlightedText match and listRow cursor outline on selected',
    ),
  );

  pairs.push(contrastPair('accent', 'chrome', 3, 'listRow cursor outline on chrome'));

  rowSurfaces.concat('background').forEach((surface) => {
    pairs.push(
      filledPair(
        'foreground',
        { alpha: badgeFillAlpha, token: 'blocked' },
        surface,
        4.5,
        `attentionBadge label on ${surface}`,
      ),
    );
  });

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
  filledPair(
    'muted',
    { alpha: diffFillAlpha, token: 'ansi1' },
    'background',
    4.5,
    'Changes diff line number and line text on the removal tint',
  ),
  filledPair(
    'foreground',
    { alpha: diffFillAlpha, token: 'ansi1' },
    'background',
    4.5,
    'Changes diff line text on the removal tint',
  ),
  filledPair(
    'muted',
    { alpha: diffFillAlpha, token: 'ansi2' },
    'background',
    4.5,
    'Changes diff line number and line text on the addition tint',
  ),
  filledPair(
    'foreground',
    { alpha: diffFillAlpha, token: 'ansi2' },
    'background',
    4.5,
    'Changes diff line text on the addition tint',
  ),
  filledPair(
    'accent',
    { alpha: normalFocusFillAlpha, token: 'accent' },
    'background',
    4.5,
    'koja-pane focused title in normal mode on the focus tint',
  ),
  filledPair(
    'dim',
    { alpha: normalFocusFillAlpha, token: 'accent' },
    'background',
    4.5,
    'koja-pane folder in normal mode on the focus tint',
  ),
  filledPair(
    'working',
    { alpha: normalFocusFillAlpha, token: 'accent' },
    'background',
    3,
    'statusMark working in a normal-mode pane header on the focus tint',
  ),
  filledPair(
    'done',
    { alpha: normalFocusFillAlpha, token: 'accent' },
    'background',
    3,
    'statusMark done in a normal-mode pane header on the focus tint',
  ),
];

const contrastPairs = (): ContrastPair[] => [
  ...rowPairs(),
  ...backgroundPairs(),
  contrastPair(
    'muted',
    'raised',
    4.5,
    'koja-changes diff hunk header and disabled actionButton label on raised',
  ),
  contrastPair('solid_foreground', 'solid', 4.5, 'actionButton label on solid'),
  contrastPair('solid', 'popover', 3, 'actionButton fill on popover'),
  contrastPair('popover', 'ansi1', 4.5, 'dialogButton danger label on ansi1'),
];

const blendChannel = (
  fillChannel: number,
  surfaceChannel: number,
  alphaFraction: number,
): string => {
  const blended = fillChannel * alphaFraction + surfaceChannel * (1 - alphaFraction);

  return Math.round(blended).toString(16).padStart(2, '0');
};

const blendOver = (fill: Fill, surfaceColor: string, palette: Record<string, string>): string => {
  const fillColor = palette[fill.token];

  if (fillColor === undefined) {
    throw new Error(`The palette has no ${fill.token} fill`);
  }

  const alphaFraction = Number.parseInt(fill.alpha, 16) / 255;
  const [fillRed, fillGreen, fillBlue] = hexChannels(fillColor);
  const [surfaceRed, surfaceGreen, surfaceBlue] = hexChannels(surfaceColor);

  const red = blendChannel(fillRed, surfaceRed, alphaFraction);
  const green = blendChannel(fillGreen, surfaceGreen, alphaFraction);
  const blue = blendChannel(fillBlue, surfaceBlue, alphaFraction);

  return `#${red}${green}${blue}`;
};

const pairKey = (pair: ContrastPair): string => {
  if (pair.fill === undefined) {
    return `${pair.text} on ${pair.surface}`;
  }

  return `${pair.text} on ${pair.fill.token} ${pair.fill.alpha} over ${pair.surface}`;
};

const contrastResult = (pair: ContrastPair, palette: Record<string, string>): ContrastResult => {
  const color = palette[pair.text];
  const surfaceColor = palette[pair.surface];

  if (color === undefined || surfaceColor === undefined) {
    throw new Error(`The palette has no ${pair.text} on ${pair.surface}`);
  }

  const measuredSurface =
    pair.fill === undefined ? surfaceColor : blendOver(pair.fill, surfaceColor, palette);

  const ratio = contrastRatio(color, measuredSurface);
  const line = `${pairKey(pair)}: ${ratio.toFixed(2)}:1, needs ${pair.minimum}:1`;

  return { line, passed: ratio >= pair.minimum };
};

describe('the UI language', () => {
  test('the kit and mods hold no hard-coded colors', async () => {
    const kitFailures = await linesMatching(kitDirectory, hardCodedColorPattern);
    const modFailures = await styleLinesMatching(hardCodedColorPattern);

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

  test('only the direction mocks skip the raw color and size checks', () => {
    const findings = [
      "src/mods/koja-mocks/directions/paper.ts:5: const card = '#ffffff';",
      "src/mods/koja-mocks/scenes/shell.ts:5: const card = '#ffffff';",
      "src/mods/koja-mocks/directions.ts:5: const card = '#ffffff';",
    ];

    expect(findings.filter((finding) => !isRawStyleExempt(finding))).toEqual(findings.slice(1));
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

  test('the contrast check blends a see-through fill over its surface', () => {
    const fixture = paletteFromTheme({
      ansi: [],
      colors: { blocked: '#ff0000', foreground: '#000000', popover: '#ffffff' },
    });

    const pair: ContrastPair = {
      fill: { alpha: '26', token: 'blocked' },
      minimum: 4.5,
      reason: 'fixture filled pair',
      surface: 'popover',
      text: 'foreground',
    };

    const result = contrastResult(pair, fixture);

    expect(result.passed).toBe(true);
    expect(result.line).toBe('foreground on blocked 26 over popover: 16.18:1, needs 4.5:1');
  });

  test('the real theme passes every checked contrast pair', async () => {
    const theme = JSON.parse(await readFile(themePath, 'utf8')) as ThemeFile;
    const palette = paletteFromTheme(theme);
    const pairs = contrastPairs();

    const failed = pairs
      .map((pair) => contrastResult(pair, palette))
      .filter((result) => !result.passed)
      .map((result) => result.line);

    expect(failed).toEqual([]);
  });

  test('every checked contrast pair names its text and surface once', () => {
    const keys = contrastPairs().map(pairKey);

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
    expect(await styleLinesMatching(sizedCallPattern)).toEqual([]);
  });
});
