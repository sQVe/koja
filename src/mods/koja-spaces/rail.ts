import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import { run } from 'herdr';

import { listRow, separator, spaceMark, spacing } from '../../kit/index.ts';
import type { TreeRow } from './tree.ts';
import { listedOf } from './tree.ts';

const insetLine = (): Element => div().px(spacing.small).child(separator());

export const railRow = (row: TreeRow, title: string, lineAbove: boolean): Element => {
  const { space, status } = listedOf(row);

  const element = listRow({
    size: 'small',
    inset: true,
    state: space.active ? 'selected' : 'normal',
    centered: true,
    label: '',
    end: [spaceMark(status)],
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
