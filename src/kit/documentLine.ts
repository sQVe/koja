import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { documentSize } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

// The bar a line's gutter draws: the warning on an edited line, the neutral mark on a commented
// line. A plain line draws none.
type LineBar = 'edited' | 'commented';

export interface DocumentLineOptions {
  number: number;
  text: string;
  bar?: LineBar;
}

type LineMark = 'fill' | 'stripe' | 'none';

const markOf = (bar: LineBar | undefined): LineMark => {
  if (bar === 'edited') {
    return 'fill';
  }

  return bar === 'commented' ? 'stripe' : 'none';
};

const gutterBar = (mark: LineMark): Element => {
  const palette = colors();
  const slot = div().w(documentSize.markWidth).h(documentSize.markHeight).flex_none();

  if (mark === 'fill') {
    return slot.bg(palette.working);
  }

  if (mark === 'stripe') {
    const stripe = div().w(documentSize.stripeWidth).h_full().bg(palette.muted);

    return slot.child(stripe);
  }

  return slot;
};

const lineNumber = (line: DocumentLineOptions, mark: LineMark): Element => {
  const ink = mark === 'none' ? 'dim' : 'foreground';
  const slot = div().w(documentSize.numberWidth).flex_none().text_right();

  return withTextRole(slot, 'detail', ink).child(String(line.number));
};

const gutter = (line: DocumentLineOptions, mark: LineMark): Element =>
  h_flex()
    .flex_none()
    .gap(documentSize.markGap)
    .items_center()
    .child(gutterBar(mark))
    .child(lineNumber(line, mark));

const editedWord = (): Element => {
  const box = div().flex_none();

  return withTextRole(box, 'detail', 'working').child('edited');
};

const lineText = (text: string): Element => {
  const box = div().flex_1().min_w(0).truncate();

  return withTextRole(box, 'body').child(text);
};

// The row draws the monospace role once, so its number, text, and mark share one font lookup.
export const documentLine = (line: DocumentLineOptions): Element => {
  const mark = markOf(line.bar);

  const row = h_flex()
    .h(documentSize.lineHeight)
    .flex_none()
    .min_w(0)
    .px(documentSize.inset)
    .gap(documentSize.textGap)
    .items_center()
    .child(gutter(line, mark))
    .child(lineText(line.text));

  if (mark === 'fill') {
    row.child(editedWord());
  }

  return withTextRole(row, 'mono');
};
