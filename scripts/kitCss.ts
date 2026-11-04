import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Declaration = [name: string, value: string];

type SizeGroupName = 'textSize' | 'iconSize' | 'spacing' | 'radius' | 'rowHeight' | 'controlSize';

type SizeModule = Record<SizeGroupName, Record<string, number>>;

interface Theme {
  background: string;
  foreground: string;
  selection: string;
  cursor: string;
  ansi: string[];
  colors: Record<string, string>;
}

interface Settings {
  font: string;
  font_size: number;
}

interface GeistFace {
  weight: number;
  url: string;
}

const outputPath = 'eval/kit.css';

const sizeGroupNames: SizeGroupName[] = [
  'textSize',
  'iconSize',
  'spacing',
  'radius',
  'rowHeight',
  'controlSize',
];

const geistFaces: GeistFace[] = [
  { weight: 400, url: 'fonts/Geist-Regular.ttf' },
  { weight: 600, url: '../config/fonts/Geist-SemiBold.ttf' },
  { weight: 700, url: '../config/fonts/Geist-Bold.ttf' },
];

const toKebabCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();

const readJson = async <Value>(path: string): Promise<Value> => {
  const text = await readFile(path, 'utf8');

  // SAFETY: Koja's own config files. Each caller names the shape its file has.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns any; the caller types the file.
  return JSON.parse(text) as Value;
};

const loadSizes = async (root: string): Promise<SizeModule> => {
  const sizePath = pathToFileURL(resolve(root, 'src', 'kit', 'size.ts')).href;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the module namespace is typed any; src/kit/size.ts exports each size group as an object of numbers.
  return (await import(sizePath)) as SizeModule;
};

const sizeDeclarations = (sizes: SizeModule): Declaration[] =>
  sizeGroupNames.flatMap((groupName) =>
    Object.entries(sizes[groupName]).map(([key, value]): Declaration => {
      const name = `--koja-${toKebabCase(groupName)}-${toKebabCase(key)}`;

      return [name, `${value}px`];
    }),
  );

const colorDeclarations = (theme: Theme): Declaration[] =>
  Object.entries(theme.colors).map(([key, value]): Declaration => [
    `--koja-color-${toKebabCase(key)}`,
    value,
  ]);

const terminalDeclarations = (theme: Theme, settings: Settings): Declaration[] => [
  ['--koja-terminal-background', theme.background],
  ['--koja-terminal-foreground', theme.foreground],
  ['--koja-terminal-selection', theme.selection],
  ['--koja-terminal-cursor', theme.cursor],
  ...theme.ansi.map((color, index): Declaration => [`--koja-terminal-ansi-${index}`, color]),
  ['--koja-font-ui', "'Geist', sans-serif"],
  ['--koja-font-terminal', `'${settings.font}', monospace`],
  ['--koja-font-terminal-size', `${settings.font_size}px`],
];

const fontFaceRule = (face: GeistFace): string =>
  [
    '@font-face {',
    "  font-family: 'Geist';",
    `  src: url('${face.url}') format('truetype');`,
    `  font-weight: ${face.weight};`,
    '}',
  ].join('\n');

const renderCss = (declarations: Declaration[]): string => {
  const lines = declarations.map(([name, value]) => `  ${name}: ${value};`);
  const rootRule = [':root {', ...lines, '}'].join('\n');

  return [...geistFaces.map(fontFaceRule), rootRule].join('\n\n') + '\n';
};

export const writeKitCss = async (root: string, output: string): Promise<void> => {
  const sizes = await loadSizes(root);

  const themePath = join(root, 'config', 'themes', 'catppuccin-latte-muted.json');
  const theme = await readJson<Theme>(themePath);

  const settings = await readJson<Settings>(join(root, 'config', 'settings.json'));

  const declarations = [
    ...sizeDeclarations(sizes),
    ...colorDeclarations(theme),
    ...terminalDeclarations(theme, settings),
  ];

  await writeFile(output, renderCss(declarations));
};

if (import.meta.main) {
  await writeKitCss('.', outputPath);

  process.stdout.write(`Wrote ${outputPath}\n`);
}
