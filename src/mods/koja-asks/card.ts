import { listOf, numberOf, recordOf, stringOf } from '../../kit/fields.ts';
import { askCardSize, controlSize, spacing } from '../../kit/size.ts';
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

export interface WindowBounds {
  width: number;
  height: number;
  maximized: boolean;
}

export interface CardWindow extends WindowBounds {
  zoom: number;
}

export interface CardGeometrySources {
  window: CardWindow | null;
  sidebar: CardBox | null;
  panel: CardBox | null;
}

export interface CardGeometry {
  width: number;
  height: number;
  at: { x: number; y: number } | null;
}

const {
  maximumWidth,
  paneClearance,
  textInset,
  bodyLineHeight,
  terminalLineHeight,
  detailLineHeight,
} = askCardSize;

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

export const cardHeight = (text: CardText, width: number): number => {
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

  return height;
};

const boxWidth = (box: CardBox | null): number => {
  if (box === null || box.hidden || box.sizePx === null) {
    return 0;
  }

  return box.sizePx;
};

export const cardGeometry = (sources: CardGeometrySources, text: CardText): CardGeometry => {
  const width = maximumWidth;

  if (sources.window === null || sources.window.maximized) {
    return { width, height: cardHeight(text, width), at: null };
  }

  const zoom = sources.window.zoom > 0 ? sources.window.zoom : 1;
  const left = boxWidth(sources.sidebar);
  const panel = boxWidth(sources.panel);
  const mainWidth = Math.max(0, sources.window.width / zoom - left - panel);
  const cardWidth = Math.min(maximumWidth, Math.max(0, mainWidth - 2 * paneClearance));
  const height = cardHeight(text, cardWidth);
  const x = (left + (mainWidth - cardWidth) / 2) * zoom;
  const y = sources.window.height - (paneClearance + height) * zoom;

  return { width: cardWidth, height, at: { x: Math.round(x), y: Math.round(y) } };
};

export const cardSignature = (ask: Ask, text: CardText, geometry: CardGeometry): string =>
  JSON.stringify([
    ask.spaceName,
    ask.agent,
    text.question,
    text.command,
    text.more,
    geometry.width,
    geometry.height,
    geometry.at,
  ]);

export const windowBoundsOf = (value: unknown): WindowBounds | null => {
  const record = recordOf(value);
  const bounds = listOf(record['bounds']);
  const width = numberOf(bounds[2]);
  const height = numberOf(bounds[3]);

  if (width === null || height === null) {
    return null;
  }

  if (width <= 0 || height <= 0) {
    return null;
  }

  const state = stringOf(record['state']);

  return { width, height, maximized: state === 'maximized' || state === 'fullscreen' };
};
