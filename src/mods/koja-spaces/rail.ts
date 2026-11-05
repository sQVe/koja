import { v_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import { run } from 'herdr';

import { colors, icon, listRow, separator, spaceMark, spacing } from '../../kit/index.ts';
import type { TreeRow } from './tree.ts';
import { listedOf } from './tree.ts';

const insetLine = (): Element => div().px(spacing.small).child(separator());

const alertMark = (id: string, text: string, retry: (cx: Context) => void): Element =>
  div()
    .id(id)
    .flex_none()
    .tooltip(text)
    .on_mouse_down('left', (_event, cx) => {
      cx.stop_propagation();
    })
    .on_click((_event, cx) => {
      cx.stop_propagation();
      retry(cx);
    })
    .child(icon('circle-alert', 'small').text_color(colors().blocked));

export const railErrorMark = (text: string, retry: (cx: Context) => void): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    centered: true,
    label: '',
    end: [alertMark('rail-machines-error', text, retry)],
  }).id('machines-error');

export const railRow = (
  row: TreeRow,
  title: string,
  lineAbove: boolean,
  error: string | null,
  retry: (cx: Context) => void,
): Element => {
  const { space, status } = listedOf(row);

  const end =
    error === null
      ? [spaceMark(status)]
      : [alertMark(`rail-error-${space.id}`, error, retry), spaceMark(status)];

  const element = listRow({
    size: 'small',
    inset: true,
    state: space.active ? 'selected' : 'normal',
    centered: true,
    label: '',
    end,
  })
    .id(`space-${space.id}`)
    .tooltip(title)
    .accessibility_label(title)
    .on_click(() => {
      run('space.select', { id: space.id });
    });

  if (!lineAbove) {
    return element;
  }

  return v_flex().child(insetLine()).child(element);
};
