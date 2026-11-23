import type { Color, Palette, ThemeToken } from './palette.ts';

const channelMaximum = 255;
const linearThreshold = 0.04045;
const linearScale = 12.92;
const gammaOffset = 0.055;
const gammaScale = 1.055;
const gammaExponent = 2.4;
const redWeight = 0.2126;
const greenWeight = 0.7152;
const blueWeight = 0.0722;
const contrastOffset = 0.05;
const hexLength = 6;
const hexRadix = 16;
const hexPair = /[0-9a-f]{2}/gi;

const toLinearChannel = (value: number): number => {
  const channel = value / channelMaximum;

  return channel <= linearThreshold
    ? channel / linearScale
    : ((channel + gammaOffset) / gammaScale) ** gammaExponent;
};

const rgbChannels = (color: Color): number[] => {
  const pairs = color.slice(1, hexLength + 1).match(hexPair) ?? [];

  return pairs.map((pair) => Number.parseInt(pair, hexRadix));
};

const relativeLuminance = (color: Color): number => {
  const [red = 0, green = 0, blue = 0] = rgbChannels(color).map(toLinearChannel);

  return redWeight * red + greenWeight * green + blueWeight * blue;
};

const contrastRatio = (first: Color, second: Color): number => {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + contrastOffset) / (darker + contrastOffset);
};

export const readableTextToken = (fill: ThemeToken, palette: Palette): ThemeToken => {
  const fillColor = palette[fill];
  const foregroundContrast = contrastRatio(fillColor, palette.foreground);
  const backgroundContrast = contrastRatio(fillColor, palette.background);

  return foregroundContrast >= backgroundContrast ? 'foreground' : 'background';
};
