import { listOf, numberOf, recordOf } from '../../kit/fields.ts';
import { controlSize, rowHeight, spacing } from '../../kit/size.ts';
import type { Ask } from './askFacts.ts';

export interface CardMore {
  count: number;
  space: string;
}

export interface CardText {
  question: string;
  command: string | null;
  more: string | null;
}

export interface CardBox {
  sizePx: number | null;
  hidden: boolean;
}

export interface CardGeometrySources {
  window: { width: number; height: number } | null;
  sidebar: CardBox | null;
  panel: CardBox | null;
}

export interface CardGeometry {
  width: number;
  height: number;
  at: { x: number; y: number } | null;
}

interface MainWidth {
  left: number;
  width: number;
}

const maximumCardWidth = 420;

const paneClearance = 16;

const contentPadding = spacing.small;

const textInset = 18;

const bodyLineHeight = 18;

const terminalLineHeight = 17;

const detailLineHeight = 16;

const footerHeight = rowHeight.large + spacing.xxsmall;

// A conservative advance per character, so the estimate never falls below the height GPUI draws.
const bodyGlyph = 7.5;

const terminalGlyph = 7.5;

export const moreText = (more: CardMore): string => {
  const asks = more.count === 1 ? 'ask' : 'asks';

  return `${more.count} more ${asks} in ${more.space}`;
};

export const cardTextOf = (ask: Ask, more: CardMore | null): CardText => ({
  question: ask.question,
  command: ask.command,
  more: more === null ? null : moreText(more),
});

const wrapLineCount = (text: string, width: number, glyph: number): number => {
  const maximum = Math.max(1, Math.floor(width / glyph));
  const words = text.split(/\s+/u).filter((word) => word !== '');

  let lines = 1;
  let current = 0;

  for (const word of words) {
    if (current === 0) {
      current = word.length;
    } else if (current + 1 + word.length <= maximum) {
      current += 1 + word.length;
    } else {
      lines += 1;
      current = word.length;
    }

    while (current > maximum) {
      lines += 1;
      current -= maximum;
    }
  }

  return lines;
};

const textWidthOf = (width: number): number =>
  Math.max(1, width - 2 * spacing.small - 2 * spacing.hairline - textInset);

export const cardHeight = (text: CardText, width: number, normal: boolean): number => {
  const textWidth = textWidthOf(width);

  let height = 2 * spacing.small + 2 * spacing.hairline + controlSize.button;

  height += spacing.small;
  height += wrapLineCount(text.question, textWidth, bodyGlyph) * bodyLineHeight;

  if (text.command !== null) {
    height += spacing.small;
    height += wrapLineCount(text.command, textWidth, terminalGlyph) * terminalLineHeight;
  }

  if (text.more !== null) {
    height += spacing.small + detailLineHeight;
  }

  if (normal) {
    height += spacing.small + footerHeight;
  }

  return height;
};

const boxWidth = (box: CardBox | null): number => {
  if (box === null || box.hidden || box.sizePx === null) {
    return 0;
  }

  return box.sizePx;
};

const mainWidthOf = (sources: CardGeometrySources, windowWidth: number): MainWidth => {
  const left = boxWidth(sources.sidebar);
  const panel = boxWidth(sources.panel);

  return { left, width: Math.max(0, windowWidth - left - panel) };
};

export const cardGeometry = (
  sources: CardGeometrySources,
  text: CardText,
  normal: boolean,
): CardGeometry => {
  if (sources.window === null) {
    const width = maximumCardWidth;

    return { width, height: cardHeight(text, width, normal), at: null };
  }

  const main = mainWidthOf(sources, sources.window.width);
  const width = Math.min(maximumCardWidth, Math.max(0, main.width - 2 * paneClearance));
  const height = cardHeight(text, width, normal);
  const x = main.left + (main.width - width) / 2;
  const y = sources.window.height - contentPadding - paneClearance - height;

  return { width, height, at: { x: Math.round(x), y: Math.round(y) } };
};

export const windowBoundsOf = (value: unknown): { width: number; height: number } | null => {
  const bounds = listOf(recordOf(value)['bounds']);
  const width = numberOf(bounds[2]);
  const height = numberOf(bounds[3]);

  if (width === null || height === null) {
    return null;
  }

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
};
