export type Color = `#${string}`;

export interface Palette {
  background: Color;
  canvas: Color;
  chrome: Color;
  surface: Color;
  popover: Color;
  raised: Color;
  hover: Color;
  selected: Color;
  border: Color;
  input: Color;
  foreground: Color;
  muted: Color;
  dim: Color;
  accent: Color;
  accent_foreground: Color;
  solid: Color;
  solid_foreground: Color;
  selection: Color;
  working: Color;
  blocked: Color;
  done: Color;
  idle: Color;
  unknown: Color;
  ansi0: Color;
  ansi1: Color;
  ansi2: Color;
  ansi3: Color;
  ansi4: Color;
  ansi5: Color;
  ansi6: Color;
  ansi7: Color;
  ansi8: Color;
  ansi9: Color;
  ansi10: Color;
  ansi11: Color;
  ansi12: Color;
  ansi13: Color;
  ansi14: Color;
  ansi15: Color;
}

export type ThemeToken = keyof Palette;

export const withAlpha = (color: Color, alpha: string): Color => `${color}${alpha}`;

const shortHexLength = 3;

const fullHexLength = 6;

const clearAlpha = '00';

const expandShortHex = (hex: string): string =>
  hex
    .split('')
    .map((digit) => `${digit}${digit}`)
    .join('');

// The same color at zero opacity. A theme color may already carry an alpha, so it is dropped first.
export const clearOf = (color: Color): Color => {
  const hex = color.slice(1);
  const isShort = hex.length <= shortHexLength + 1;
  const rgb = isShort ? expandShortHex(hex.slice(0, shortHexLength)) : hex.slice(0, fullHexLength);

  return `#${rgb}${clearAlpha}`;
};

const diffFillAlpha = '18';

export const diffTints = (palette: Palette): { added: Color; removed: Color } => ({
  added: withAlpha(palette.ansi2, diffFillAlpha),
  removed: withAlpha(palette.ansi1, diffFillAlpha),
});

const isColor = (value: string): value is Color => value.startsWith('#');

const toColor = (value: string): Color => (isColor(value) ? value : `#${value}`);

export const toPalette = (theme: Record<string, string>): Palette => {
  const fallback = theme['foreground'] ?? '';
  const color = (token: ThemeToken): Color => toColor(theme[token] ?? fallback);

  return {
    background: color('background'),
    canvas: color('canvas'),
    chrome: color('chrome'),
    surface: color('surface'),
    popover: color('popover'),
    raised: color('raised'),
    hover: color('hover'),
    selected: color('selected'),
    border: color('border'),
    input: color('input'),
    foreground: color('foreground'),
    muted: color('muted'),
    dim: color('dim'),
    accent: color('accent'),
    accent_foreground: color('accent_foreground'),
    solid: color('solid'),
    solid_foreground: color('solid_foreground'),
    selection: color('selection'),
    working: color('working'),
    blocked: color('blocked'),
    done: color('done'),
    idle: color('idle'),
    unknown: color('unknown'),
    ansi0: color('ansi0'),
    ansi1: color('ansi1'),
    ansi2: color('ansi2'),
    ansi3: color('ansi3'),
    ansi4: color('ansi4'),
    ansi5: color('ansi5'),
    ansi6: color('ansi6'),
    ansi7: color('ansi7'),
    ansi8: color('ansi8'),
    ansi9: color('ansi9'),
    ansi10: color('ansi10'),
    ansi11: color('ansi11'),
    ansi12: color('ansi12'),
    ansi13: color('ansi13'),
    ansi14: color('ansi14'),
    ansi15: color('ansi15'),
  };
};
